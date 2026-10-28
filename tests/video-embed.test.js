import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { youtubeId, addVideoEmbeds } from "../app/js/video-embed.js";

const t = (k) => k;
const ID = "dQw4w9WgXcQ";

test("the video id is read from the usual YouTube addresses and from nothing else", () => {
  for (const u of [`https://www.youtube.com/watch?v=${ID}&t=5`, `https://youtu.be/${ID}?si=x`, `https://m.youtube.com/watch?v=${ID}`,
    `https://youtube.com/shorts/${ID}`, `https://www.youtube.com/live/${ID}`, `https://www.youtube-nocookie.com/embed/${ID}`]) {
    assert.equal(youtubeId(u), ID, u);
  }
  for (const u of ["https://example.com/watch?v=" + ID, `https://youtube.com.evil.example/watch?v=${ID}`, "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx", `javascript:alert(1)//youtu.be/${ID}`, "not a url", ""]) {
    assert.equal(youtubeId(u), null, u);
  }
});

test("a link makes a box with a Play button and no frame; the frame appears only on press", () => {
  const { document } = parseHTML("<html><body><div id='b'><p><a href='https://youtu.be/" + ID + "'>video</a></p></div></body></html>");
  const body = document.getElementById("b");
  addVideoEmbeds({ doc: document, body, t });
  assert.equal(body.querySelectorAll(".video-embed").length, 1);
  assert.equal(body.querySelector("iframe"), null);
  assert.equal(body.querySelector("img"), null);
  body.querySelector(".video-embed button").onclick();
  const frame = body.querySelector("iframe");
  assert.match(frame.getAttribute("src"), /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/);
  assert.equal(frame.getAttribute("title"), "video.title");
  assert.equal(body.querySelector(".video-embed button"), null);
});

test("the same video twice makes one box, and at most two boxes are made", () => {
  const ids = ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"];
  const links = [ids[0], ids[0], ...ids.slice(1)].map((i) => `<a href="https://youtu.be/${i}">x</a>`).join("");
  const { document } = parseHTML(`<html><body><div id='b'>${links}</div></body></html>`);
  addVideoEmbeds({ doc: document, body: document.getElementById("b"), t });
  assert.equal(document.querySelectorAll(".video-embed").length, 2);
});

test("a post without YouTube links is left alone", () => {
  const { document } = parseHTML("<html><body><div id='b'><a href='https://example.com'>x</a></div></body></html>");
  addVideoEmbeds({ doc: document, body: document.getElementById("b"), t });
  assert.equal(document.querySelectorAll(".video-embed").length, 0);
});
