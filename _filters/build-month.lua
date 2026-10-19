-- Fills every empty []{.build-month} span with the month and year of the build, for example "October 2026". It runs at render time, so the text is in the HTML and needs no script. The date is UTC, so a local render and the publishing workflow agree.
function Span(el)
  if el.classes:includes('build-month') then
    el.content = pandoc.Inlines({ pandoc.Str(os.date('!%B %Y')) })
    return el
  end
end
