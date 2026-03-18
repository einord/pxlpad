-- Pxlpad Aseprite Extension
-- Syncs sprite data with a local WebSocket server.

-- ---------------------------------------------------------------------------
-- State
-- ---------------------------------------------------------------------------

local serverAddress = "ws://localhost:9874"
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

    result[#result + 1] = b64chars:sub(math.floor(n / 262144) + 1, math.floor(n / 262144) + 1)
    result[#result + 1] = b64chars:sub(math.floor(n / 4096) % 64 + 1, math.floor(n / 4096) % 64 + 1)
    result[#result + 1] = b64chars:sub(math.floor(n / 64) % 64 + 1, math.floor(n / 64) % 64 + 1)
    result[#result + 1] = b64chars:sub(n % 64 + 1, n % 64 + 1)

    i = i + 3
  end

  local remaining = len - i + 1
  if remaining == 2 then
    local n = bytes[i] * 65536 + bytes[i + 1] * 256
    result[#result + 1] = b64chars:sub(math.floor(n / 262144) + 1, math.floor(n / 262144) + 1)
    result[#result + 1] = b64chars:sub(math.floor(n / 4096) % 64 + 1, math.floor(n / 4096) % 64 + 1)
    result[#result + 1] = b64chars:sub(math.floor(n / 64) % 64 + 1, math.floor(n / 64) % 64 + 1)
    result[#result + 1] = "="
  elseif remaining == 1 then
    local n = bytes[i] * 65536
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

  ws:sendText(jsonEncode({
    type = "sprite-data",
    filename = sprite.filename or "",
    width = sprite.width,
    height = sprite.height,
    frame = frameNumber,
    data = pixelData,
  }))
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

  ws:sendText(jsonEncode({
    type = "sprite-list",
    sprites = list,
  }))
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
  local brushSize = data.brushSize or 1

  if not x or not y then
    print("[pxlpad] draw: missing x or y")
    return
  end
  if not color then
    print("[pxlpad] draw: missing color, keys: " .. tostring(data))
    return
  end

  local r = color[1] or 0
  local g = color[2] or 0
  local b = color[3] or 0
  local a = color[4] or 255

  local sprite = app.sprite
  if not sprite then
    print("[pxlpad] draw: no active sprite")
    return
  end

  -- Collect all pixels to draw (brush square centered on x,y)
  local pixels = {}
  local half = math.floor(brushSize / 2)
  for dy = -half, brushSize - half - 1 do
    for dx = -half, brushSize - half - 1 do
      local px = x + dx
      local py = y + dy
      if px >= 0 and px < sprite.width and py >= 0 and py < sprite.height then
        pixels[#pixels + 1] = { x = px, y = py }
      end
    end
  end

  if #pixels == 0 then return end

  local cel = app.cel
  suppressChange = true

  app.transaction("Pxlpad Draw", function()
    if cel then
      local img = cel.image:clone()
      local celPos = cel.position

      -- Calculate bounding box including all brush pixels
      local minX = celPos.x
      local minY = celPos.y
      local maxX = celPos.x + img.width - 1
      local maxY = celPos.y + img.height - 1

      for _, p in ipairs(pixels) do
        if p.x < minX then minX = p.x end
        if p.y < minY then minY = p.y end
        if p.x > maxX then maxX = p.x end
        if p.y > maxY then maxY = p.y end
      end

      -- Check if we need to expand the cel
      if minX < celPos.x or minY < celPos.y or maxX >= celPos.x + img.width or maxY >= celPos.y + img.height then
        local newW = maxX - minX + 1
        local newH = maxY - minY + 1
        local newImg = Image(newW, newH, sprite.colorMode)
        newImg:clear()
        newImg:drawImage(img, celPos.x - minX, celPos.y - minY)

        for _, p in ipairs(pixels) do
          newImg:drawPixel(p.x - minX, p.y - minY, app.pixelColor.rgba(r, g, b, a))
        end

        cel.image = newImg
        cel.position = Point(minX, minY)
      else
        for _, p in ipairs(pixels) do
          img:drawPixel(p.x - celPos.x, p.y - celPos.y, app.pixelColor.rgba(r, g, b, a))
        end
        cel.image = img
      end
    else
      -- No cel exists — create one covering the brush area
      local layer = app.layer
      if not layer then return end
      local frameNum = app.frame and app.frame.frameNumber or 1

      local minX = pixels[1].x
      local minY = pixels[1].y
      local maxX = pixels[1].x
      local maxY = pixels[1].y
      for i = 2, #pixels do
        if pixels[i].x < minX then minX = pixels[i].x end
        if pixels[i].y < minY then minY = pixels[i].y end
        if pixels[i].x > maxX then maxX = pixels[i].x end
        if pixels[i].y > maxY then maxY = pixels[i].y end
      end

      local newImg = Image(maxX - minX + 1, maxY - minY + 1, sprite.colorMode)
      newImg:clear()
      for _, p in ipairs(pixels) do
        newImg:drawPixel(p.x - minX, p.y - minY, app.pixelColor.rgba(r, g, b, a))
      end
      sprite:newCel(layer, frameNum, newImg, Point(minX, minY))
    end
  end)

  suppressChange = false
end

-- ---------------------------------------------------------------------------
-- WebSocket connection
-- ---------------------------------------------------------------------------

local function onConnected()
  connected = true
  print("[pxlpad] Connected to " .. serverAddress)

  -- Register with the server
  ws:sendText(jsonEncode({
    type = "register",
    role = "extension",
  }))

  -- Send sprite list
  sendSpriteList()

  -- Send initial sprite data if there is an active sprite
  if app.sprite then
    sendSpriteData(app.sprite)
    attachSpriteListener(app.sprite)
  end
end

local function onDisconnected(err)
  connected = false
  ws = nil
  print("[pxlpad] Disconnected" .. (err ~= "" and ": " .. err or ""))
  detachSpriteListener()
end

local function onMessage(data)
  local msg = jsonDecode(data)
  if not msg or not msg.type then return end

  if msg.type == "request-sprite-list" then
    sendSpriteList()
  elseif msg.type == "request-sprite-data" then
    if app.sprite then
      sendSpriteData(app.sprite)
    end
  elseif msg.type == "draw" then
    handleDrawCommand(msg)
  end
end

local function connectToServer()
  -- Clean up any previous connection
  if ws then
    pcall(function() ws:close() end)
    ws = nil
  end
  connected = false

  print("[pxlpad] Connecting to " .. serverAddress .. " ...")

  local ok, result = pcall(function()
    return WebSocket{
      url = serverAddress,
      deflate = false,
      minreconnectwait = 2,
      maxreconnectwait = 10,

      -- Single callback for all events (Aseprite WebSocket API)
      onreceive = function(messageType, data, err)
        if messageType == WebSocketMessageType.OPEN then
          onConnected()
        elseif messageType == WebSocketMessageType.TEXT then
          onMessage(data)
        elseif messageType == WebSocketMessageType.CLOSE then
          onDisconnected(err or "")
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

  -- Load preferences
  if p.preferences.serverAddress then
    serverAddress = p.preferences.serverAddress
  else
    p.preferences.serverAddress = serverAddress
  end

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
