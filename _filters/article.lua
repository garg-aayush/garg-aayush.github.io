-- Article filter for posts (loaded from posts/_metadata.yml). Computes reading time and section count, adds the phone contents list, and appends the "all writing" link.
-- The two added blocks sit inside <nav> elements because Quarto removes every <nav> from RSS feed content, so feed readers do not see them.
-- Quarto builds the appendix (references, footnotes, appendix sections) after every filter has run, so on a page with an appendix the end link is moved behind it by scripts/place-article-end.mjs, a project post-render step.
local WORDS_PER_MINUTE = 200 -- same rate Quarto uses for listing reading times

local function esc(s)
  return (s:gsub('&', '&amp;'):gsub('<', '&lt;'):gsub('>', '&gt;'):gsub('"', '&quot;'))
end

local function plural(n, unit)
  return n .. ' ' .. unit .. (n == 1 and '' or 's')
end

local function split_lines(text)
  local lines = {}
  for line in (text:gsub('\r\n?', '\n') .. '\n'):gmatch('(.-)\n') do lines[#lines + 1] = line end
  return lines
end

-- Quarto estimates a post's reading time for its listings from the markdown that its own partitioning leaves behind: no YAML front matter and no first heading. The two functions below repeat that partitioning, and reading_minutes applies Quarto's formula, so the article header always shows the same number as the post rows.
local function strip_front_matter(text)
  local lines = split_lines((text:gsub('^%s+', '')))
  local function is_end(line) return line:match('^%-%-%-[ \t]*$') or line:match('^%.%.%.[ \t]*$') end
  if #lines < 3 or not lines[1]:match('^%-%-%-[ \t]*$') or lines[2]:match('^%s*$') or is_end(lines[2]) then return text end
  for i = 2, #lines do
    if is_end(lines[i]) then return '\n' .. table.concat(lines, '\n', i + 1) end
  end
  return text
end

-- A code fence line: up to three spaces of indent, then three or more backticks or tildes. Returns the run and the text after it.
local function fence_of(line)
  local run, rest = line:match('^ ? ? ?(```+)(.*)$')
  if not run then run, rest = line:match('^ ? ? ?(~~~+)(.*)$') end
  return run, rest
end

local function strip_first_heading(text)
  local kept = {}
  local found = false
  local fence_char, fence_len
  for _, line in ipairs(split_lines(text)) do
    if fence_char then
      kept[#kept + 1] = line
      local run, rest = fence_of(line)
      if run and run:sub(1, 1) == fence_char and #run >= fence_len and rest:match('^%s*$') then fence_char = nil end
    elseif found then
      kept[#kept + 1] = line
    else
      local run = fence_of(line)
      if run then
        fence_char, fence_len = run:sub(1, 1), #run
        kept[#kept + 1] = line
      elseif line:match('^#+%s') then
        found = true
      elseif line:match('^=+%s*$') or line:match('^%-+%s*$') then
        local previous = kept[#kept]
        if previous and previous ~= '' then
          kept[#kept] = nil
          found = true
        else
          kept[#kept + 1] = line
        end
      else
        kept[#kept + 1] = line
      end
    end
  end
  return table.concat(kept, '\n')
end

local function reading_minutes()
  local path = quarto.doc.input_file
  local file = path and io.open(path, 'rb')
  if not file then return nil end
  local source = file:read('*a')
  file:close()
  local _, spaces = strip_first_heading(strip_front_matter(source)):gsub(' ', '')
  return math.ceil((spaces + 1) / WORDS_PER_MINUTE)
end

function Pandoc(doc)
  local headers = {}

  doc.blocks:walk({
    Header = function(el)
      if el.level <= 3 and not el.classes:includes('unlisted') then
        headers[#headers + 1] = el
      end
    end,
  })

  -- Section count and the phone list use the shallowest heading level present, so posts that start at h3 still count
  local top = 4
  for _, h in ipairs(headers) do if h.level < top then top = h.level end end
  local sections = 0
  for _, h in ipairs(headers) do if h.level == top then sections = sections + 1 end end

  local minutes = reading_minutes()
  if minutes then doc.meta['reading-time-text'] = minutes .. ' min read' end
  if sections > 0 then doc.meta['section-count-text'] = pandoc.MetaString(plural(sections, 'section')) end

  local blocks = pandoc.List()

  -- Phone contents disclosure. CSS shows it only where the left rail is hidden.
  local toc_title = doc.meta['toc-title'] and pandoc.utils.stringify(doc.meta['toc-title']) or ''
  if toc_title ~= '' and sections > 0 then
    local items = pandoc.List()
    for _, h in ipairs(headers) do
      if h.level == top and h.identifier ~= '' then
        items:insert({ pandoc.Plain({ pandoc.Link(h.content, '#' .. h.identifier) }) })
      end
    end
    blocks:insert(pandoc.RawBlock('html', '<nav class="article-toc-mobile" aria-label="' .. esc(toc_title) .. '"><details><summary>' .. esc(toc_title) .. '</summary>'))
    blocks:insert(pandoc.BulletList(items))
    blocks:insert(pandoc.RawBlock('html', '</details></nav>'))
  end
  blocks:extend(doc.blocks)

  local back_text = doc.meta['back-link-text'] and pandoc.utils.stringify(doc.meta['back-link-text']) or ''
  local back_href = doc.meta['back-link-href'] and pandoc.utils.stringify(doc.meta['back-link-href']) or ''
  if back_text ~= '' and back_href ~= '' then
    blocks:insert(pandoc.RawBlock('html', '<nav class="article-end" aria-label="' .. esc(back_text) .. '"><a class="link-back" href="' .. esc(back_href) .. '">' .. esc(back_text) .. '</a></nav>'))
  end

  doc.blocks = blocks
  return doc
end
