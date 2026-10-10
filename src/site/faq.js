// src/site/faq.js
// Questions shown on the FAQ page (all of them) and on the home page (the first few).

export const FAQS = [
  {
    q: "What does Library Checker do?",
    a: `<p>When you're on a Goodreads book page, it checks your public library's catalog and shows whether the library has the book, whether a copy is on the shelf right now, how many people are waiting for it, and whether an eBook or audiobook is available through Libby/OverDrive. You can also check a whole Goodreads shelf in one click.</p>`,
  },
  {
    q: "Does it cost anything?",
    a: `<p>There's a free plan: 5 book checks a day, one shelf scan a day (the first 10 books on the page), up to 3 libraries, digital availability, hold-queue wait estimates, and a searchable, exportable history.</p>
        <p>Premium is $5 a month and adds unlimited checks, unlimited shelf scans, up to 5 libraries, overnight email alerts, and one-click opening of your hold pages. See <a href="/pricing">pricing</a>.</p>`,
  },
  {
    q: "Which libraries does it work with?",
    a: `<p>Libraries whose catalog runs on BiblioCommons, a platform used by many public libraries in Canada and the United States. The <a href="/libraries">supported libraries page</a> lists the ones you can pick from. If yours uses BiblioCommons but isn't listed, you can add its address under Settings → Add a custom library, or <a href="/contact?topic=library">ask us to add it</a>.</p>
        <p>For libraries on other catalog systems, we can't search the print catalog yet — but if the library lends eBooks and audiobooks through Libby/OverDrive (most do), you can still add it in Settings and see digital availability and wait times. Search for your library by name in Settings; libraries that are digital-only are marked as such.</p>`,
  },
  {
    q: "Do I need an account?",
    a: `<p>Yes — a free one. You can sign up with your email (we send a 6-digit code to confirm it) or continue with Google. An account is what keeps your daily limits, your history and your subscription together.</p>`,
  },
  {
    q: "Does it place holds for me?",
    a: `<p>No. It shows you where each book stands and opens the right page at your library, but placing a hold needs your library card, so that last step happens on your library's own site. On a shelf scan, Premium can open the pages for all the books you care about at once.</p>`,
  },
  {
    q: "How accurate are the wait times?",
    a: `<p>They're estimates. For print books we divide the number of holds by the number of copies and assume a typical three-week loan. For eBooks and audiobooks the estimate comes from OverDrive itself. Libraries set their own loan periods and some books get returned early, so treat them as a rough guide, not a promise.</p>`,
  },
  {
    q: "It says my library doesn't have a book, but I know it does.",
    a: `<p>This usually means the library has a different edition than the one on the Goodreads page — in that case you'll see \"Library has it (other edition)\". If a book you know is in the catalog shows as not found, please <a href="/contact?topic=bug">send us the title</a> and we'll look into it.</p>`,
  },
  {
    q: "How do shelf scans work?",
    a: `<p>Open one of your shelves on Goodreads (for example Want to Read) in list view and click <strong>Check library availability for this page</strong>. Library Checker looks up each book shown on the page — so if you want more books checked, increase Goodreads' \"per page\" setting. The free plan checks the first 10 books on the page; Premium checks them all.</p>`,
  },
  {
    q: "How do the overnight alerts work?",
    a: `<p>With Premium, the books from your shelf scans are re-checked every night. When one becomes available to borrow — as a print copy, or as an eBook or audiobook that was previously all checked out — we email you a short list. Alerts follow your primary library.</p>`,
  },
  {
    q: "Can I export my history?",
    a: `<p>Yes. In the History tab, search or filter your checks, then choose <strong>Export CSV</strong> (opens in Excel or Google Sheets) or <strong>JSON</strong>. It's free for everyone.</p>`,
  },
  {
    q: "Does it work on other sites, like Amazon or StoryGraph?",
    a: `<p>Not yet — Library Checker currently works on Goodreads book pages and shelves. Other sites are something we'd like to add.</p>`,
  },
  {
    q: "What happens to my data?",
    a: `<p>We keep your account details and your check history so the extension can work, and we don't sell your data or show ads. The <a href="/privacy">privacy policy</a> lists exactly what's collected and who we share it with. You can ask us to delete your account and data any time via the <a href="/contact?topic=account">contact form</a>.</p>`,
  },
  {
    q: "How do I cancel Premium?",
    a: `<p>Open the extension, go to the Account tab and choose <strong>Manage billing</strong>. You keep Premium until the end of the period you've already paid for, then your account returns to the free plan.</p>`,
  },
  {
    q: "Which browsers are supported?",
    a: `<p>Google Chrome. Other Chromium-based browsers may work, but we only test on Chrome.</p>`,
  },
];
