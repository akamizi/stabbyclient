# TODO

Parts of xenomorph's web interface not yet in the client, then known defects, then things
to verify. Roughly in the order worth doing.

## Missing features

Not for now, until what exists is well tested: everything in xenomorph's Settings that is
an administrative page and not an API (profile editing, advanced, people, instance setup).

- [ ] Feeds page: RSS/Atom sources to subscribe to.
- [ ] Settings: profile editing, advanced, people (readmit accounts), and, for the
      administrator, instance settings (server-side pages, not API).
- [ ] Profile: add a person to a list; instance "Nuke" (administrator).
- [ ] Composer: text format (plain / Markdown / HTML), language, attachments by URL,
      video and audio uploads (images only today), instance announcements, emoji picker.
- [ ] Notifications: mark as read; today the badge resets when the tab opens.

## Known defects

- [ ] Possible bug (reported by the user): likes given to a couple of the test user's posts
      from another account do not show in this client (neither as notifications nor as
      counts, to be checked). The user thinks Tooth, another client, shows the same, which
      would point at what the server returns rather than at this client. To do: log in as
      the test user, look at `/api/v1/notifications` and `favourites_count` / `favourited_by`
      of those posts straight from the API, then decide where the problem is.

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
notifications, polls, quotes, enlarging pictures, diagnostic line in the menu; and the
former defects: silent "load older posts", login failure messages and stale app registration,
duplicate send after a lost answer, replies in an open thread, "boosted by" after an action,
Content-Security-Policy on `/app/`.
