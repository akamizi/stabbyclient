# TODO

Parts of xenomorph's web interface not yet in the client, then known defects, then things
to verify. Roughly in the order worth doing.

## Missing features

- [ ] Enlarge images on click/tap (post images, avatars, profile banners): a full-screen view
      that closes on tap, Back or Esc.
- [ ] Feeds page: RSS/Atom sources to subscribe to.
- [ ] Settings: profile editing, advanced, people (readmit accounts), and, for the
      administrator, instance settings (server-side pages, not API).
- [ ] Profile: add a person to a list; instance "Nuke" (administrator).
- [ ] Composer: text format (plain / Markdown / HTML), language, attachments by URL,
      video and audio uploads (images only today), instance announcements, emoji picker.
- [ ] Notifications: mark as read; today the badge resets when the tab opens.

## Known defects

- [ ] "Load older posts" fails silently.
- [ ] Login: no clear message when it fails offline or the user refuses; an obsolete app
      registration is never recovered.
- [ ] If the answer to a send is lost, the post can be sent twice.
- [ ] A reply just written does not appear in the open thread at once.
- [ ] After a like, the "shared by" header of a boost is lost.
- [ ] No Content-Security-Policy on `/app/`.

## To verify

- [ ] Android: install as an app, standalone start, service-worker update, send while offline.
- [ ] Follow, Block, Mute and Direct message on a real person's profile (covered by unit
      tests only).
- [ ] Voting on someone else's poll (a poll of the test user cannot be voted by the same user).
- [ ] End-to-end run: the thread step is unstable because the server updates reply counts
      late.
- [ ] Tidy the test user's leftover data on the instance.

## Done

Home, Federated and Groups (with the new-posts button and background refresh), threads in
place, like/dislike/boost, per-post menu, More menu (search, bookmarks, admirations, drafts,
scheduled, pinned, following, followers, follow requests, hashtags, lists), profiles,
notifications, polls, quotes, diagnostic line in the menu.
