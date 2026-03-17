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
local suppressChange = false    -- flag to suppress change events during draw

-- ---------------------------------------------------------------------------
-- Base64 encoder
-- ---------------------------------------------------------------------------

local b64chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

--- Encode a table of byte values (0-255) into a base64 string.
local function base64Encode(bytes)
  local len = #bytes
  local result = {}
  local i = 1

  while i <= len - 2 do
    local b0 = bytes[i]
    local b1 = bytes[i + 1]
    local b2 = bytes[i + 2]

    local n = b0 * 65536 + b1 * 256 + b2

    local c0 = math.floor(n / 262144) -- n >> 18
    local c1 = math.floor(n / 4096) % 64 -- (n >> 12) & 63
    local c2 = math.floor(n / 64) % 64 -- (n >> 6) & 63
    local c3 = n % 64 -- n & 63

    result[#result + 1] = b64chars:sub(c0 + 1, c0 + 1)
    result[#result + 1] = b64chars:sub(c1 + 1, c1 + 1)
    result[#result + 1] = b64chars:sub(c2 + 1, c2 + 1)
    result[#result + 1] = b64chars:sub(c3 + 1, c3 + 1)

    i = i + 3
  end

  -- Handle remaining bytes (padding)
  local remaining = len - i + 1
  if remaining == 2 then
    local b0 = bytes[i]
    local b1 = bytes[i + 1]
    local n = b0 * 65536 + b1 * 256

    local c0 = math.floor(n / 262144)
    local c1 = math.floor(n / 4096) % 64
    local c2 = math.floor(n / 64) % 64

    result[#result + 1] = b64chars:sub(c0 + 1, c0 + 1)
    result[#result + 1] = b64chars:sub(c1 + 1, c1 + 1)
    result[#result + 1] = b64chars:sub(c2 + 1, c2 + 1)
    result[#result + 1] = "="
  elseif remaining == 1 then
    local b0 = bytes[i]
    local n = b0 * 65536

    local c0 = math.floor(n / 262144)
    local c1 = math.floor(n / 4096) % 64

    result[#result + 1] = b64chars:sub(c0 + 1, c0 + 1)
    result[#result + 1] = b64chars:sub(c1 + 1, c1 + 1)
    result[#result + 1] = "=="
  end

  return table.concat(result)
end

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
      if v == math.floor(v) then
        val = string.format("%d", v)
      else
        val = tostring(v)
      end
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

  -- Fallback: very small subset parser
  local t = {}
  -- Match string values
  for k, v in str:gmatch('"([^"]+)"%s*:%s*"([^"]*)"') do
    t[k] = v
  end
  -- Match number values
  for k, v in str:gmatch('"([^"]+)"%s*:%s*(%d+)') do
    t[k] = tonumber(v)
  end
  -- Match arrays of numbers like "color":[255,0,0,255]
  for k, arr in str:gmatch('"([^"]+)"%s*:%s*(%[%d[%d,%s]*%])') do
    local values = {}
    for num in arr:gmatch("%d+") do
      values[#values + 1] = tonumber(num)
    end
    t[k] = values
  end
  if next(t) then return t end
  return nil
end

-- ---------------------------------------------------------------------------
-- Sprite data extraction
-- ---------------------------------------------------------------------------

--- Build RGBA byte array from a sprite at the given frame and return as
--- base64-encoded string.
local function getSpritePixelData(sprite, frameNumber)
  if not sprite then return nil end
  frameNumber = frameNumber or 1

  -- Create a flat image by rendering the full sprite
  local img = Image(sprite.spec)
  img:drawSprite(sprite, frameNumber)

  local w = sprite.width
  local h = sprite.height
  local bytes = {}
  local idx = 0

  for y = 0, h - 1 do
    for x = 0, w - 1 do
      local pixel = img:getPixel(x, y)
      -- Use Aseprite's built-in color unpacking for correctness
      idx = idx + 1; bytes[idx] = app.pixelColor.rgbaR(pixel)
      idx = idx + 1; bytes[idx] = app.pixelColor.rgbaG(pixel)
      idx = idx + 1; bytes[idx] = app.pixelColor.rgbaB(pixel)
      idx = idx + 1; bytes[idx] = app.pixelColor.rgbaA(pixel)
    end
  end

  return base64Encode(bytes)
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

--- Send full sprite pixel data for the given sprite.
local function sendSpriteData(sprite)
  if not connected or not ws or not sprite then return end

  local frameNumber = 1
  if app.frame then
    frameNumber = app.frame.frameNumber
  end

  local pixelData = getSpritePixelData(sprite, frameNumber)
  if not pixelData then return end

  local msg = jsonEncode({
    type = "sprite-data",
    filename = sprite.filename or "",
    width = sprite.width,
    height = sprite.height,
    frame = frameNumber,
    data = pixelData,
  })

  ws:sendText(msg)
end

--- Attach a change listener to the given sprite.
local function attachSpriteListener(sprite)
  detachSpriteListener()
  if not sprite then return end

  activeSpriteRef = sprite
  spriteChangeListener = sprite.events:on("change", function()
    if suppressChange then return end
    sendSpriteData(sprite)
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
-- Incoming draw command handler
-- ---------------------------------------------------------------------------

--- Apply a draw command from the server to the active sprite.
local function handleDrawCommand(data)
  local sprite = app.sprite
  if not sprite then return end

  local x = data.x
  local y = data.y
  local color = data.color -- expected: {r, g, b, a}

  if not x or not y or not color then return end

  local r = color[1] or 0
  local g = color[2] or 0
  local b = color[3] or 0
  local a = color[4] or 255

  local cel = app.cel
  if not cel then return end

  -- Suppress our own change event to avoid echoing back
  suppressChange = true

  app.transaction("Pxlpad Draw", function()
    local img = cel.image
    -- Adjust coordinates relative to cel position
    local celPos = cel.position
    local localX = x - celPos.x
    local localY = y - celPos.y

    -- Check bounds
    if localX >= 0 and localX < img.width and localY >= 0 and localY < img.height then
      img:drawPixel(localX, localY, app.pixelColor.rgba(r, g, b, a))
    end
  end)

  suppressChange = false
end

-- ---------------------------------------------------------------------------
-- Registration message
-- ---------------------------------------------------------------------------

local function sendRegister()
  if not connected or not ws then return end

  local msg = jsonEncode({
    type = "register",
    role = "extension",
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

        -- Register with the server
        sendRegister()

        -- Send sprite list on connect
        sendSpriteList()

        -- Send initial sprite data if there is an active sprite
        if app.sprite then
          sendSpriteData(app.sprite)
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
        elseif data.type == "request-sprite-data" then
          if app.sprite then
            sendSpriteData(app.sprite)
          end
        elseif data.type == "draw" then
          handleDrawCommand(data)
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
      sendSpriteData(sprite)
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
