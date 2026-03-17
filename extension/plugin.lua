-- Pxlpad Aseprite Extension
-- Syncs sprite data with a local WebSocket server.

-- ---------------------------------------------------------------------------
-- Preferences / defaults
-- ---------------------------------------------------------------------------

if plugin.preferences.serverAddress == nil then
  plugin.preferences.serverAddress = "ws://localhost:9874"
end

-- ---------------------------------------------------------------------------
-- State
-- ---------------------------------------------------------------------------

local ws = nil                  -- current WebSocket connection
local connected = false
local reconnectTimer = nil
local spriteChangeListener = nil
local activeSpriteRef = nil     -- the sprite we are currently listening to

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

--- Build a JSON string manually (Aseprite ships json.lua but keeping it
--- dependency-free is safer across versions).
local function jsonEncode(tbl)
  local parts = {}
  for k, v in pairs(tbl) do
    local val
    if type(v) == "string" then
      -- Escape backslashes and quotes
      val = '"' .. v:gsub('\\', '\\\\'):gsub('"', '\\"') .. '"'
    elseif type(v) == "number" then
      val = tostring(v)
    elseif type(v) == "boolean" then
      val = v and "true" or "false"
    elseif type(v) == "table" then
      -- Only support arrays of simple objects (one level deep)
      local items = {}
      for _, item in ipairs(v) do
        if type(item) == "table" then
          items[#items + 1] = jsonEncode(item)
        elseif type(item) == "string" then
          items[#items + 1] = '"' .. item:gsub('\\', '\\\\'):gsub('"', '\\"') .. '"'
        else
          items[#items + 1] = tostring(item)
        end
      end
      val = "[" .. table.concat(items, ",") .. "]"
    else
      val = "null"
    end
    parts[#parts + 1] = '"' .. k .. '":' .. val
  end
  return "{" .. table.concat(parts, ",") .. "}"
end

--- Minimal JSON decoder – handles the small messages we expect from the
--- server.  Falls back to nil on anything unexpected.
local function jsonDecode(str)
  -- Use Aseprite's built-in json module if available
  local ok, json = pcall(require, "json")
  if ok and json and json.decode then
    local success, result = pcall(json.decode, str)
    if success then return result end
  end

  -- Fallback: very small subset parser (type field only)
  local t = {}
  for k, v in str:gmatch('"([^"]+)"%s*:%s*"([^"]*)"') do
    t[k] = v
  end
  for k, v in str:gmatch('"([^"]+)"%s*:%s*(%d+)') do
    t[k] = tonumber(v)
  end
  if next(t) then return t end
  return nil
end

-- ---------------------------------------------------------------------------
-- Sprite change handling
-- ---------------------------------------------------------------------------

--- Remove any existing sprite-level change listener.
local function detachSpriteListener()
  if spriteChangeListener and activeSpriteRef then
    activeSpriteRef.events:off(spriteChangeListener)
    spriteChangeListener = nil
    activeSpriteRef = nil
  end
end

--- Send a sprite-update message for the given sprite.
local function sendSpriteUpdate(sprite)
  if not connected or not ws or not sprite then return end

  local msg = jsonEncode({
    type = "sprite-update",
    filename = sprite.filename or "",
    width = sprite.width,
    height = sprite.height,
    colorMode = sprite.colorMode,
  })

  ws:sendText(msg)
end

--- Attach a change listener to the given sprite.
local function attachSpriteListener(sprite)
  detachSpriteListener()
  if not sprite then return end

  activeSpriteRef = sprite
  spriteChangeListener = sprite.events:on("change", function()
    sendSpriteUpdate(sprite)
  end)
end

--- Respond with a list of all currently open sprites.
local function sendSpriteList()
  if not connected or not ws then return end

  local list = {}
  for _, s in ipairs(app.sprites) do
    list[#list + 1] = {
      filename = s.filename or "",
      width = s.width,
      height = s.height,
      colorMode = s.colorMode,
    }
  end

  local msg = jsonEncode({
    type = "sprite-list",
    sprites = list,
  })

  ws:sendText(msg)
end

-- ---------------------------------------------------------------------------
-- WebSocket connection
-- ---------------------------------------------------------------------------

local function stopReconnectTimer()
  if reconnectTimer then
    reconnectTimer()  -- cancel the timer
    reconnectTimer = nil
  end
end

local function scheduleReconnect()
  stopReconnectTimer()
  -- Try to reconnect every 5 seconds
  reconnectTimer = app.events:on("tick", (function()
    local elapsed = 0
    return function()
      elapsed = elapsed + 1
      if elapsed >= 300 then  -- ~5 seconds at 60fps
        elapsed = 0
        stopReconnectTimer()
        connectToServer()
      end
    end
  end)())
end

--- Main connection routine.
function connectToServer()
  -- Clean up any previous connection
  if ws then
    pcall(function() ws:close() end)
    ws = nil
  end
  connected = false
  stopReconnectTimer()

  local url = plugin.preferences.serverAddress

  local ok, result = pcall(function()
    return WebSocket{
      url = url,

      onconnected = function()
        connected = true
        print("[pxlpad] Connected to " .. url)

        -- Send initial state if there is an active sprite
        if app.sprite then
          sendSpriteUpdate(app.sprite)
          attachSpriteListener(app.sprite)
        end
      end,

      ondisconnected = function()
        connected = false
        print("[pxlpad] Disconnected from server")
        detachSpriteListener()
        scheduleReconnect()
      end,

      onreceive = function(message, isBinary)
        if isBinary then return end

        local data = jsonDecode(message)
        if not data or not data.type then return end

        if data.type == "request-sprite-list" then
          sendSpriteList()
        elseif data.type == "request-sprite-update" then
          if app.sprite then
            sendSpriteUpdate(app.sprite)
          end
        end
      end,
    }
  end)

  if ok and result then
    ws = result
    ws:connect()
  else
    print("[pxlpad] Failed to create WebSocket: " .. tostring(result))
    scheduleReconnect()
  end
end

-- ---------------------------------------------------------------------------
-- Site-change listener (active sprite changed)
-- ---------------------------------------------------------------------------

local siteChangeListener = nil

local function attachSiteChangeListener()
  if siteChangeListener then return end
  siteChangeListener = app.events:on("sitechange", function()
    local sprite = app.sprite
    if sprite ~= activeSpriteRef then
      attachSpriteListener(sprite)
      sendSpriteUpdate(sprite)
    end
  end)
end

local function detachSiteChangeListener()
  if siteChangeListener then
    app.events:off(siteChangeListener)
    siteChangeListener = nil
  end
end

-- ---------------------------------------------------------------------------
-- Plugin lifecycle
-- ---------------------------------------------------------------------------

function init(plugin)
  -- Register a menu command for manual (re)connection
  plugin:newMenuGroup{
    id = "pxlpad_group",
    title = "Pxlpad",
  }

  plugin:newCommand{
    id = "pxlpad_connect",
    title = "Pxlpad: Connect",
    group = "pxlpad_group",
    onclick = function()
      connectToServer()
    end,
  }

  -- Start listening for site changes and attempt initial connection
  attachSiteChangeListener()
  connectToServer()
end

function exit(plugin)
  -- Tear down everything cleanly
  detachSiteChangeListener()
  detachSpriteListener()
  stopReconnectTimer()

  if ws then
    pcall(function() ws:close() end)
    ws = nil
  end
  connected = false
end
