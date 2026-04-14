const currentUser = {
  id: "u-alex",
  name: "Alex Viewer",
  subscriptions: new Set(["c-blockcraft", "c-redstone-labs"]),
  watchHistory: ["v-stream-arch", "v-ranking-ml", "v-cdn-ops", "v-redstone-hooks"],
  liked: new Set(["v-stream-arch"]),
  disliked: new Set(),
  watchLater: new Set(["v-moderation-ai"])
};

const channels = [
  {
    id: "c-blockcraft",
    name: "BlockCraft Academy",
    description: "Creator growth, publishing strategy, and channel optimization.",
    subscribers: 221340,
    featured: "v-stream-arch",
    posts: ["New creator studio walkthrough drops Friday."]
  },
  {
    id: "c-redstone-labs",
    name: "Redstone Labs",
    description: "Hands-on system architecture and distributed infrastructure patterns.",
    subscribers: 412870,
    featured: "v-cdn-ops",
    posts: ["Live Q&A: scaling feed ranking in production."]
  },
  {
    id: "c-craft-vision",
    name: "CraftVision",
    description: "Recommendations, ranking models, and experimentation playbooks.",
    subscribers: 95310,
    featured: "v-ranking-ml",
    posts: ["A/B testing pitfalls: new article and video now available."]
  }
];

const videos = [
  {
    id: "v-stream-arch",
    title: "Designing HLS/DASH Streaming at Scale",
    channelId: "c-blockcraft",
    description: "Adaptive bitrate, manifests, and edge delivery strategies for reliable playback.",
    tags: ["streaming", "hls", "cdn"],
    privacy: "public",
    durationMin: 26,
    views: 580221,
    likes: 38200,
    dislikes: 510,
    watchTimeHours: 970000,
    uploadedAt: "2026-04-10",
    comments: [
      { user: "infra_guru", text: "Great breakdown of startup latency tradeoffs." },
      { user: "edge_master", text: "Would love a deep dive on multi-CDN routing." }
    ]
  },
  {
    id: "v-cdn-ops",
    title: "CDN Caching Patterns for Video Platforms",
    channelId: "c-redstone-labs",
    description: "Hot path optimization, signed URL flow, and segment cache invalidation.",
    tags: ["cdn", "performance", "security"],
    privacy: "public",
    durationMin: 14,
    views: 331900,
    likes: 21840,
    dislikes: 244,
    watchTimeHours: 488000,
    uploadedAt: "2026-03-29",
    comments: [
      { user: "packetqueen", text: "This helped us tune our edge TTLs." }
    ]
  },
  {
    id: "v-ranking-ml",
    title: "Recommendation Ranking: Candidate Retrieval to Re-Ranking",
    channelId: "c-craft-vision",
    description: "From collaborative filtering to feature-rich ranking in low-latency serving stacks.",
    tags: ["recommendation", "ml", "ranking"],
    privacy: "public",
    durationMin: 34,
    views: 740112,
    likes: 47550,
    dislikes: 603,
    watchTimeHours: 1550000,
    uploadedAt: "2026-04-08",
    comments: [
      { user: "modelsmith", text: "Useful section on diversity constraints." },
      { user: "gradstudent42", text: "Can you release a feature store schema sample?" }
    ]
  },
  {
    id: "v-moderation-ai",
    title: "Automated Moderation Pipelines with Human Review",
    channelId: "c-redstone-labs",
    description: "Policy tiers, ML scoring, reviewer queues, and escalation workflows.",
    tags: ["moderation", "safety", "ml"],
    privacy: "unlisted",
    durationMin: 18,
    views: 126112,
    likes: 9320,
    dislikes: 180,
    watchTimeHours: 201000,
    uploadedAt: "2026-02-15",
    comments: [{ user: "policy_ops", text: "This mirrors our internal trust stack." }]
  },
  {
    id: "v-upload-meta",
    title: "Upload Service: Metadata, Privacy States, and Processing",
    channelId: "c-blockcraft",
    description: "Chunked upload, metadata validation, and publish workflows.",
    tags: ["upload", "metadata", "backend"],
    privacy: "private",
    durationMin: 9,
    views: 56200,
    likes: 3410,
    dislikes: 88,
    watchTimeHours: 89000,
    uploadedAt: "2026-04-13",
    comments: [{ user: "videoeng", text: "Great framing of event contracts." }]
  },
  {
    id: "v-redstone-hooks",
    title: "Creator Analytics: Watch Time, Retention, and Growth Loops",
    channelId: "c-blockcraft",
    description: "Build dashboards for creators with actionable retention insights.",
    tags: ["analytics", "creator-tools", "watch-time"],
    privacy: "public",
    durationMin: 22,
    views: 286004,
    likes: 15660,
    dislikes: 340,
    watchTimeHours: 392000,
    uploadedAt: "2026-04-02",
    comments: [{ user: "growthpm", text: "Retention cohort section was excellent." }]
  }
];

const state = {
  query: "",
  sort: "relevance",
  duration: "all",
  dateRange: "all",
  mode: "recommended",
  selectedVideoId: null
};

const refs = {
  channelGrid: document.getElementById("channelGrid"),
  videoGrid: document.getElementById("videoGrid"),
  feedTitle: document.getElementById("feedTitle"),
  feedMeta: document.getElementById("feedMeta"),
  detailsPanel: document.getElementById("detailsPanel"),
  searchForm: document.getElementById("searchForm"),
  searchInput: document.getElementById("searchInput"),
  sortFilter: document.getElementById("sortFilter"),
  durationFilter: document.getElementById("durationFilter"),
  dateFilter: document.getElementById("dateFilter"),
  watchLaterCount: document.getElementById("watchLaterCount"),
  likedCount: document.getElementById("likedCount"),
  viewWatchLater: document.getElementById("viewWatchLater"),
  viewLiked: document.getElementById("viewLiked")
};

function formatNumber(num) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(num);
}

function getChannelById(channelId) {
  return channels.find(channel => channel.id === channelId);
}

function dayDiff(fromDate) {
  const now = new Date();
  const target = new Date(fromDate + "T00:00:00Z");
  return Math.floor((now - target) / (1000 * 60 * 60 * 24));
}

function buildRecommendationScore(video) {
  const historyTags = currentUser.watchHistory
    .map(watchedId => videos.find(v => v.id === watchedId))
    .filter(Boolean)
    .flatMap(v => v.tags);

  const channelBoost = currentUser.subscriptions.has(video.channelId) ? 1.6 : 1;
  const historyBoost = currentUser.watchHistory.some(id => id === video.id)
    ? 0.6
    : video.tags.some(tag => historyTags.includes(tag))
      ? 1.3
      : 1;
  const freshnessBoost = 1 + Math.max(0, 21 - dayDiff(video.uploadedAt)) / 50;
  const popularityBoost = Math.log10(video.views + 10);
  return channelBoost * historyBoost * freshnessBoost * popularityBoost;
}

function applyFilters(inputVideos) {
  return inputVideos.filter(video => {
    const query = state.query.trim().toLowerCase();
    const searchable = [video.title, video.description, ...video.tags, getChannelById(video.channelId)?.name || ""].join(" ").toLowerCase();
    const matchesQuery = !query || searchable.includes(query);

    const durationMatch =
      state.duration === "all" ||
      (state.duration === "short" && video.durationMin < 10) ||
      (state.duration === "medium" && video.durationMin >= 10 && video.durationMin <= 30) ||
      (state.duration === "long" && video.durationMin > 30);

    const ageDays = dayDiff(video.uploadedAt);
    const dateMatch = state.dateRange === "all" || ageDays <= Number(state.dateRange);

    return matchesQuery && durationMatch && dateMatch;
  });
}

function sortVideos(filtered) {
  const ranked = filtered.map(video => ({ ...video, score: buildRecommendationScore(video) }));

  if (state.sort === "date") {
    return ranked.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  }

  if (state.sort === "popularity") {
    return ranked.sort((a, b) => b.views - a.views);
  }

  return ranked.sort((a, b) => b.score - a.score);
}

function getFeedVideos() {
  if (state.mode === "watchLater") {
    return videos.filter(video => currentUser.watchLater.has(video.id));
  }
  if (state.mode === "liked") {
    return videos.filter(video => currentUser.liked.has(video.id));
  }
  return videos.filter(video => video.privacy !== "private");
}

function renderChannels() {
  refs.channelGrid.innerHTML = "";

  channels.forEach(channel => {
    const isSubscribed = currentUser.subscriptions.has(channel.id);
    const el = document.createElement("article");
    el.className = "channel-card";
    el.innerHTML = `
      <h3>${channel.name}</h3>
      <p>${channel.description}</p>
      <p><strong>${formatNumber(channel.subscribers)}</strong> subscribers</p>
      <p>Update: ${channel.posts[0]}</p>
      <button class="sub-btn" data-channel-id="${channel.id}">${isSubscribed ? "Subscribed" : "Subscribe"}</button>
    `;
    refs.channelGrid.appendChild(el);
  });

  refs.channelGrid.querySelectorAll(".sub-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const channelId = btn.dataset.channelId;
      if (currentUser.subscriptions.has(channelId)) {
        currentUser.subscriptions.delete(channelId);
      } else {
        currentUser.subscriptions.add(channelId);
      }
      const channel = channels.find(item => item.id === channelId);
      if (channel) {
        channel.subscribers += currentUser.subscriptions.has(channelId) ? 1 : -1;
      }
      renderChannels();
      renderFeed();
    });
  });
}

function renderFeed() {
  const filtered = applyFilters(getFeedVideos());
  const sorted = sortVideos(filtered);
  refs.videoGrid.innerHTML = "";

  const template = document.getElementById("videoCardTemplate");
  sorted.forEach(video => {
    const channel = getChannelById(video.channelId);
    const node = template.content.firstElementChild.cloneNode(true);

    const thumb = node.querySelector(".thumb");
    thumb.textContent = `${video.title.slice(0, 26)}...`;
    thumb.style.background = `linear-gradient(135deg, hsl(${(video.views % 360)}, 70%, 30%), #0c1020)`;

    node.querySelector(".title").textContent = video.title;
    node.querySelector(".meta").textContent = `${channel?.name || "Unknown"} • ${formatNumber(video.views)} views • ${video.durationMin} min`;
    node.querySelector(".desc").textContent = video.description;

    node.querySelector(".like-btn").addEventListener("click", () => {
      if (currentUser.liked.has(video.id)) currentUser.liked.delete(video.id);
      else {
        currentUser.liked.add(video.id);
        currentUser.disliked.delete(video.id);
      }
      updateCounts();
    });

    node.querySelector(".dislike-btn").addEventListener("click", () => {
      if (currentUser.disliked.has(video.id)) currentUser.disliked.delete(video.id);
      else {
        currentUser.disliked.add(video.id);
        currentUser.liked.delete(video.id);
      }
      updateCounts();
    });

    node.querySelector(".watchlater-btn").addEventListener("click", () => {
      if (currentUser.watchLater.has(video.id)) currentUser.watchLater.delete(video.id);
      else currentUser.watchLater.add(video.id);
      updateCounts();
      if (state.mode === "watchLater") renderFeed();
    });

    node.querySelector(".share-btn").addEventListener("click", () => {
      const shareUrl = `${location.origin}${location.pathname}?video=${video.id}`;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(shareUrl)
          .then(() => alert(`Share link copied:\n${shareUrl}`))
          .catch(() => prompt("Copy this share link:", shareUrl));
      } else {
        prompt("Copy this share link:", shareUrl);
      }
    });

    thumb.addEventListener("click", () => renderVideoDetail(video.id));
    node.querySelector(".title").addEventListener("click", () => renderVideoDetail(video.id));

    refs.videoGrid.appendChild(node);
  });

  refs.feedMeta.textContent = `${sorted.length} videos returned`;

  const modeLabel =
    state.mode === "watchLater"
      ? "Watch Later"
      : state.mode === "liked"
        ? "Liked Videos"
        : "Recommended For You";
  refs.feedTitle.textContent = modeLabel;

  const selectedStillVisible = sorted.some(video => video.id === state.selectedVideoId);
  if (sorted.length && !selectedStillVisible) {
    renderVideoDetail(sorted[0].id);
  }

  if (!sorted.length) {
    state.selectedVideoId = null;
    refs.detailsPanel.innerHTML = `
      <h2>Video Details</h2>
      <p>No videos match the current filters. Try clearing search or changing filters.</p>
    `;
  }
}

function getRelatedVideos(video) {
  return videos
    .filter(candidate => candidate.id !== video.id && candidate.privacy !== "private")
    .map(candidate => {
      const overlap = candidate.tags.filter(tag => video.tags.includes(tag)).length;
      const sameChannel = candidate.channelId === video.channelId ? 1 : 0;
      const score = overlap * 2 + sameChannel + Math.log10(candidate.views + 1);
      return { candidate, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(item => item.candidate);
}

function renderVideoDetail(videoId) {
  const video = videos.find(v => v.id === videoId);
  if (!video) return;
  state.selectedVideoId = videoId;
  const channel = getChannelById(video.channelId);
  const related = getRelatedVideos(video);

  refs.detailsPanel.innerHTML = `
    <div class="video-detail">
      <h2>Now Viewing</h2>
      <div class="thumbnail" style="background: linear-gradient(160deg, hsl(${(video.likes % 360)}, 70%, 32%), #090d18);">${video.durationMin} min</div>
      <h3>${video.title}</h3>
      <p><strong>${channel?.name || "Unknown"}</strong> • ${video.privacy.toUpperCase()}</p>
      <p>${video.description}</p>
      <p>
        Views: <strong>${formatNumber(video.views)}</strong><br/>
        Likes: <strong>${formatNumber(video.likes)}</strong> • Dislikes: <strong>${formatNumber(video.dislikes)}</strong><br/>
        Watch time: <strong>${formatNumber(video.watchTimeHours)}</strong> hours
      </p>

      <h3>Comments (${video.comments.length})</h3>
      <div class="comment-list">
        ${video.comments.map(comment => `<article class="comment"><strong>@${comment.user}</strong><br/>${comment.text}</article>`).join("")}
      </div>

      <h3>Related Videos</h3>
      <div class="related-list">
        ${related.map(item => `<button class="related-item" data-related-id="${item.id}">${item.title}</button>`).join("")}
      </div>

      <h3>Moderation</h3>
      <button id="reportContentBtn">Report content</button>
    </div>
  `;

  refs.detailsPanel.querySelectorAll(".related-item").forEach(btn => {
    btn.addEventListener("click", () => renderVideoDetail(btn.dataset.relatedId));
  });

  const reportBtn = document.getElementById("reportContentBtn");
  reportBtn?.addEventListener("click", () => {
    alert("Report submitted to moderation queue (demo flow).");
  });
}

function updateCounts() {
  refs.watchLaterCount.textContent = String(currentUser.watchLater.size);
  refs.likedCount.textContent = String(currentUser.liked.size);
}

function wireEvents() {
  refs.searchForm.addEventListener("submit", event => {
    event.preventDefault();
    state.query = refs.searchInput.value;
    state.mode = "recommended";
    renderFeed();
  });

  refs.sortFilter.addEventListener("change", () => {
    state.sort = refs.sortFilter.value;
    renderFeed();
  });

  refs.durationFilter.addEventListener("change", () => {
    state.duration = refs.durationFilter.value;
    renderFeed();
  });

  refs.dateFilter.addEventListener("change", () => {
    state.dateRange = refs.dateFilter.value;
    renderFeed();
  });

  refs.viewWatchLater.addEventListener("click", () => {
    state.mode = "watchLater";
    renderFeed();
  });

  refs.viewLiked.addEventListener("click", () => {
    state.mode = "liked";
    renderFeed();
  });
}

function init() {
  updateCounts();
  renderChannels();
  wireEvents();
  renderFeed();

  const urlVideoId = new URLSearchParams(window.location.search).get("video");
  if (urlVideoId && videos.some(video => video.id === urlVideoId)) {
    renderVideoDetail(urlVideoId);
  }
}

init();
