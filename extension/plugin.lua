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
local spriteChangeListener = nil
local activeSpriteRef = nil     -- the sprite we are currently listening to
local suppressChange = false    -- flag to suppress change events during draw

-- ---------------------------------------------------------------------------
-- Base64 encoder
-- ---------------------------------------------------------------------------

local b64chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

local function base64Encode(bytes)
  local len = #bytes
  local result = {}
  local i = 1

  while i <= len - 2 do
    local b0 = bytes[i]
    local b1 = bytes[i + 1]
    local b2 = bytes[i + 2]

    local n = b0 * 65536 + b1 * 256 + b2

    local c0 = math.floor(n / 262144)
    local c1 = math.floor(n / 4096) % 64
    local c2 = math.floor(n / 64) % 64
    local c3 = n % 64

    result[#result + 1] = b64chars:sub(c0 + 1, c0 + 1)
    result[#result + 1] = b64chars:sub(c1 + 1, c1 + 1)
    result[#result + 1] = b64chars:sub(c2 + 1, c2 + 1)
    result[#result + 1] = b64chars:sub(c3 + 1, c3 + 1)

    i = i + 3
  end

  local remaining = len - i + 1
  if remaining == 2 then
    local b0 = bytes[i]
    local b1 = bytes[i + 1]
    local n = b0 * 65536 + b1 * 256

    result[#result + 1] = b64chars:sub(math.floor(n / 262144) + 1, math.floor(n / 262144) + 1)
    result[#result + 1] = b64chars:sub(math.floor(n / 4096) % 64 + 1, math.floor(n / 4096) % 64 + 1)
    result[#result + 1] = b64chars:sub(math.floor(n / 64) % 64 + 1, math.floor(n / 64) % 64 + 1)
    result[#result + 1] = "="
  elseif remaining == 1 then
    local b0 = bytes[i]
    local n = b0 * 65536

    result[#result + 1] = b64chars:sub(math.floor(n / 262144) + 1, math.floor(n / 262144) + 1)
    result[#result + 1] = b64chars:sub(math.floor(n / 4096) % 64 + 1, math.floor(n / 4096) % 64 + 1)
    result[#result + 1] = "=="
  end

  return table.concat(result)
end

-- ---------------------------------------------------------------------------
-- JSON helpers
-- ---------------------------------------------------------------------------

local function jsonEncode(tbl)
  local parts = {}
  for k, v in pairs(tbl) do
    local val
    if type(v) == "string" then
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

local function jsonDecode(str)
  local ok, json = pcall(require, "json")
  if ok and json and json.decode then
    local success, result = pcall(json.decode, str)
    if success then return result end
  end

  local t = {}
  for k, v in str:gmatch('"([^"]+)"%s*:%s*"([^"]*)"') do
    t[k] = v
  end
  for k, v in str:gmatch('"([^"]+)"%s*:%s*(%d+)') do
    t[k] = tonumber(v)
  end
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

local function getSpritePixelData(sprite, frameNumber)
  if not sprite then return nil end
  frameNumber = frameNumber or 1

  local img = Image(sprite.spec)
  img:drawSprite(sprite, frameNumber)

  local w = sprite.width
  local h = sprite.height
  local bytes = {}
  local idx = 0

  for y = 0, h - 1 do
    for x = 0, w - 1 do
      local pixel = img:getPixel(x, y)
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

local function detachSpriteListener()
  if spriteChangeListener and activeSpriteRef then
    activeSpriteRef.events:off(spriteChangeListener)
    spriteChangeListener = nil
    activeSpriteRef = nil
  end
end

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

local function attachSpriteListener(sprite)
  detachSpriteListener()
  if not sprite then return end

  activeSpriteRef = sprite
  spriteChangeListener = sprite.events:on("change", function()
    if suppressChange then return end
    sendSpriteData(sprite)
  end)
end

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

local function handleDrawCommand(data)
  local sprite = app.sprite
  if not sprite then return end

  local x = data.x
  local y = data.y
  local color = data.color

  if not x or not y or not color then return end

  local r = color[1] or 0
  local g = color[2] or 0
  local b = color[3] or 0
  local a = color[4] or 255

  local cel = app.cel
  if not cel then return end

  suppressChange = true

  app.transaction("Pxlpad Draw", function()
    local img = cel.image
    local celPos = cel.position
    local localX = x - celPos.x
    local localY = y - celPos.y

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

  ws:sendText(jsonEncode({
    type = "register",
    role = "extension",
  }))
end

-- ---------------------------------------------------------------------------
-- WebSocket connection
-- ---------------------------------------------------------------------------

local function connectToServer()
  -- Clean up any previous connection
  if ws then
    pcall(function() ws:close() end)
    ws = nil
  end
  connected = false

  local url = plugin.preferences.serverAddress
  print("[pxlpad] Connecting to " .. url .. " ...")

  local ok, result = pcall(function()
    return WebSocket{
      url = url,

      onconnected = function()
        connected = true
        print("[pxlpad] Connected to " .. url)

        sendRegister()
        sendSpriteList()

        if app.sprite then
          sendSpriteData(app.sprite)
          attachSpriteListener(app.sprite)
        end
      end,

      ondisconnected = function()
        connected = false
        ws = nil
        print("[pxlpad] Disconnected from server")
        detachSpriteListener()
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

function init(p)
  print("[pxlpad] Extension loading...")

  p:newCommand{
    id = "pxlpad_connect",
    title = "Connect to Pxlpad Server",
    group = "sprite_properties",
    onclick = function()
      connectToServer()
    end,
  }

  attachSiteChangeListener()
  connectToServer()

  print("[pxlpad] Extension loaded")
end

function exit(p)
  detachSiteChangeListener()
  detachSpriteListener()

  if ws then
    pcall(function() ws:close() end)
    ws = nil
  end
  connected = false
end
