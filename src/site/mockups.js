// src/site/mockups.js
// Product pictures drawn in HTML/CSS, using real lookups as sample data, so the
// site never depends on screenshots that go stale.

const bookIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34d367" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`;

// The extension popup after checking a book at three libraries.
export function popupMock() {
  return `
      <figure aria-label="Example of the Library Checker popup showing hold counts, digital copies and other libraries">
        <div class="mock-window" role="img" aria-label="Library Checker popup: The Silent Patient has 85 holds on 9 copies at Hamilton Public Library, with an audiobook available now and a copy available at Toronto Public Library">
          <div class="mock-bar"><span class="brand-icon">${bookIcon}</span> Library Checker</div>
          <div class="mock-body">
            <div class="mock-book">
              <div><strong>The Silent Patient</strong><span>Alex Michaelides</span></div>
              <span class="mock-btn">Check again</span>
            </div>
            <div class="mock-result">
              <div class="mock-result-top">
                <span class="mock-dot">◔</span>
                <div>
                  <div class="mock-title">In Hamilton Public Library's collection</div>
                  <div class="mock-sub">85 holds on 9 copies · about 7 months wait — tap to join the hold queue →</div>
                </div>
              </div>
              <div class="mock-digital">📱 Digital<br>eBook: 69 holds · about 5 months wait<br>Audiobook: available now</div>
              <div class="mock-others">
                <small>Your other libraries</small>
                <div class="mock-other good"><b>Toronto Public Library</b><span>Available now</span></div>
                <div class="mock-other"><b>Vancouver Public Library</b><span>Not in catalog</span></div>
              </div>
            </div>
          </div>
        </div>
        <figcaption class="mock-caption">Example check across three libraries</figcaption>
      </figure>`;
}

// A Goodreads shelf after a scan, with the premium one-click buttons.
export function shelfMock() {
  return `
      <figure aria-label="Example of a Goodreads shelf with Library Checker badges">
        <div class="mock-shelf" role="img" aria-label="A Goodreads Want to Read shelf where each book shows a badge: available now, on hold with a wait time, or not in the catalog but available as an eBook">
          <h3>Want to Read</h3>
          <span class="mock-shelf-btn">📚 Check library availability for this page</span>
          <div class="mock-shelf-actions"><span>✅ Open available (4)</span><span>⏳ Open hold-queue pages (7)</span><span>📱 Open digital copies (3)</span></div>
          <div class="mock-row"><a>Project Hail Mary</a><br><span class="badge badge-good">✅ Available now</span></div>
          <div class="mock-row"><a>Red Rising</a><br><span class="badge badge-wait">⏳ On hold · 61 holds on 11 copies · about 4 months wait</span></div>
          <div class="mock-row"><a>The Midnight Library</a><br><span class="badge badge-none">⬜ Not in catalog</span><span class="digital-line">📱 eBook: available now</span></div>
          <div class="mock-row"><a>Piranesi</a><br><span class="badge badge-wait">📗 Library has it (other edition)</span></div>
        </div>
        <figcaption class="mock-caption">Example shelf after one click (Premium buttons shown)</figcaption>
      </figure>`;
}

// The overnight alert email.
export function emailMock() {
  return `
      <figure aria-label="Example of a Library Checker shelf alert email">
        <div class="mock-email" role="img" aria-label="Email titled 2 books from your shelf are now available, listing one book available at the library and one eBook ready to borrow">
          <div class="from">From: Library Checker &nbsp;·&nbsp; Today, 3:02 AM</div>
          <div class="subject">2 books from your shelf are now available</div>
          <p>Good news — these books from your Goodreads shelf are now available:</p>
          <ul>
            <li><strong>Red Rising</strong> by Pierce Brown — <a>available at Hamilton Public Library</a></li>
            <li><strong>The Silent Patient</strong> by Alex Michaelides — <a>eBook ready to borrow at Hamilton Public Library</a></li>
          </ul>
        </div>
        <figcaption class="mock-caption">Example overnight alert (Premium)</figcaption>
      </figure>`;
}
