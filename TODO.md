# TODO

Parts of xenomorph's web interface not yet in the client, then known defects, then things
to verify. Roughly in the order worth doing.

## Missing features

Not for now, until what exists is well tested: everything in xenomorph's Settings that is
an administrative page and not an API (profile editing, advanced, people, instance setup).

- [ ] Show which list is selected among Home, Federated, Groups and Notifications (the tab
      bar does not mark the active one).
- [ ] New post composer as a pop-up: open it over the page, clearly set apart from what is
      underneath (today it opens inline at the top of Home).
- [ ] Show custom emoji: names, bios, post text and reactions carry `:shortcode:` that the
      server describes in an `emojis` list (shortcode and picture address); today they appear
      as plain text.
- [ ] Feeds page: RSS/Atom sources to subscribe to.
- [ ] Settings: profile editing, advanced, people (readmit accounts), and, for the
      administrator, instance settings (server-side pages, not API).
- [ ] Profile: add a person to a list; instance "Nuke" (administrator).

## Known defects

- [ ] Likes put by another account on the test user's posts: findings so far (oh_pyt's likes
      of 17/10 17:46). The server has them (notifications of type favourite and a
      `favourites_count` of 1 on those posts), so the data is there. The client hid them
      for two reasons, both fixed in the working copy but not yet published: it never showed
      like/boost counts, and posts already on screen (or in the cache) were never redrawn
      with the server's newer state, so a like made elsewhere did not appear. Open: whether
      Tooth's behaviour has the same cause (its lists may simply lag: the server updates
      timeline lists a few seconds after a like, while the single post is immediate).

## To verify

- [ ] Uploading a video and an audio file from the composer (images are covered).
- [ ] Announcements: shown above Home and dismissed per device (needs an announcement set on
      the server; none was available to look at).
- [ ] Emoji suggestions with a real custom-emoji set (the test instance answered with none).
- [ ] Notifications "Mark as read" with real notifications (the test user has none; only the
      server's marker round trip was run).

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
notifications with a read position kept by the server, composer (format, language, video/audio,
pictures from an address, polls, quotes, emoji suggestions), announcements, polls, quotes, enlarging pictures, diagnostic line in the menu; and the
former defects: silent "load older posts", login failure messages and stale app registration,
duplicate send after a lost answer, replies in an open thread, "boosted by" after an action,
Content-Security-Policy on `/app/`.
