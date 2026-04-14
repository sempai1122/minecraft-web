# Scalable Video Platform System Design

## 1) Core Product Concept
A multi-platform (web + mobile) video ecosystem where creators publish content through channels and viewers discover, watch, and engage with videos. The architecture is optimized for high write throughput (uploads, interactions), high read throughput (feeds, playback), and low-latency global delivery.

### Primary personas
- **Creators:** publish and manage video libraries, audience, and channel identity.
- **Viewers:** consume, discover, and interact with content.
- **Moderators/Admins:** enforce policy, quality, and safety.

---

## 2) Functional Architecture (Domain Modules)

### A. Identity & Accounts
- User registration/login (OIDC + social sign-in optional)
- Role model: `viewer`, `creator`, `moderator`, `admin`
- Session/token lifecycle (JWT + refresh tokens)

### B. Channel Service
- One-to-many: `user -> channels` (or one channel per user for v1)
- Channel profile: name, handle, avatar, banner, description
- Subscriber graph (follow/subscription edges)
- Channel home composition:
  - Featured video
  - Upload list (date/popularity sort)
  - Playlists
  - Community posts

### C. Video Service
- Upload initiation + resumable upload (chunked)
- Metadata management: title, description, tags, category, thumbnail, language
- Visibility states: `public`, `unlisted`, `private`
- Versioned metadata updates + audit trail

### D. Processing & Delivery Pipeline
- Event-driven transcoding workflow
- Multi-bitrate output (e.g., 240p/360p/480p/720p/1080p)
- ABR packaging for HLS and/or DASH
- Thumbnail extraction, preview generation, content fingerprinting
- CDN cache invalidation/versioning on publish

### E. Discovery & Recommendations
- Personalized home feed (history + subscriptions + trending)
- Search index + filters (date, popularity, duration)
- Related videos service (embedding similarity + co-watch behavior)

### F. Engagement Service
- Like/dislike reactions
- Comments + threaded replies
- Watch-later and playlists
- Share links (deep links, unlisted token support)

### G. Analytics & Monetization (Optional)
- Creator dashboard: views, watch time, retention, CTR, audience geography
- Ads eligibility + revenue share accounting
- Fraud/invalid traffic detection hooks

### H. Trust & Safety
- User/content reporting flows
- Automated moderation (vision/audio/text classifiers)
- Rule engine + human review queue + enforcement actions

---

## 3) High-Level Microservice Topology

1. **API Gateway / BFF**
   - AuthN/AuthZ, routing, rate limiting, request shaping
2. **User Service**
3. **Channel Service**
4. **Video Metadata Service**
5. **Upload Service** (pre-signed URLs, multipart management)
6. **Media Processing Service** (orchestrates transcoding jobs)
7. **Playback Manifest Service**
8. **Recommendation Service**
9. **Search Service**
10. **Engagement Service** (likes/comments/playlists)
11. **Subscription Graph Service**
12. **Notification Service** (push/email/in-app)
13. **Moderation Service**
14. **Analytics Pipeline** (events -> warehouse/lake)

**Communication pattern:**
- Synchronous: gRPC/REST for online reads and writes
- Asynchronous: Kafka/PubSub/SQS for state-change events (`video_uploaded`, `video_published`, `comment_created`, etc.)

---

## 4) Data Model (v1)

### Core entities
- `User(id, email, password_hash, roles, created_at)`
- `Channel(id, owner_user_id, handle, name, avatar_url, banner_url, description, created_at)`
- `Video(id, channel_id, storage_key, title, description, visibility, duration_sec, status, published_at)`
- `VideoTag(video_id, tag)`
- `Subscription(subscriber_user_id, channel_id, created_at)`
- `Reaction(user_id, video_id, type, created_at)`
- `Comment(id, video_id, user_id, parent_comment_id, body, created_at)`
- `Playlist(id, owner_user_id, name, privacy)`
- `PlaylistItem(playlist_id, video_id, position)`
- `WatchEvent(user_id, video_id, timestamp, progress_sec, device, session_id)`

### Storage recommendations
- **Relational DB (PostgreSQL/MySQL):** strong consistency metadata (users/channels/videos/comments)
- **Graph/Key-value store:** high-scale subscription graph and feed fan-out helpers
- **Object storage (S3/GCS/Azure Blob):** source + encoded media + thumbnails
- **Search engine (Elasticsearch/OpenSearch):** full text + faceting
- **Cache (Redis):** hot metadata, counters, session and recommendation cache
- **Data lake/warehouse (BigQuery/Snowflake/Redshift):** analytics/ML features

---

## 5) Critical Flows

### A. Upload-to-Publish
1. Creator requests upload session.
2. Upload service issues pre-signed multipart URLs.
3. Client uploads chunks to object storage.
4. `video_uploaded` event emitted.
5. Media pipeline transcodes + packages ABR renditions.
6. Moderation checks (automated).
7. On pass, status becomes `published`, index/search update, notify subscribers.

### B. Watch Playback
1. Client requests playback data.
2. Manifest service validates access (private/unlisted/public).
3. Returns HLS/DASH manifest URL.
4. Player fetches segments from CDN (adaptive bitrate).
5. Client emits watch telemetry (start, quartiles, complete, seek, abandon).

### C. Personalized Home Feed
1. Request from authenticated user.
2. Recommendation service retrieves candidate sets:
   - subscribed channels recent uploads
   - collaborative/content-based candidates
   - trending/novelty pool
3. Ranker applies ML scoring + business constraints (freshness, diversity, safety).
4. Response cached briefly; impression events logged.

---

## 6) Recommendation System Design

### Candidate generation
- Subscription-based retrieval (fresh uploads)
- Co-watch graph retrieval
- Embedding nearest-neighbor retrieval (video/user embeddings)
- Trending by region/category/time window

### Ranking features
- User: recency/frequency, historical watch completion, subscriptions
- Content: CTR, retention curves, freshness, language, quality signals
- Context: device type, local time, network quality
- Policy constraints: safe-content gating, creator diversity caps

### Online + offline loop
- Offline training from warehouse features
- Model registry + versioning
- Online inference service (low-latency scoring)
- A/B testing framework with guardrails

---

## 7) Scalability & Reliability

### Scalability strategies
- Stateless app services behind autoscaling
- Read replicas for metadata DB
- CDN edge caching for manifests/segments/thumbnails
- Write-optimized event ingestion (append-only logs)
- Backpressure + retry queues for transcoding pipeline

### Reliability patterns
- Idempotent consumers for event processing
- Outbox pattern for DB-event consistency
- Circuit breakers/timeouts between services
- Multi-AZ deployment, optional multi-region for global audience
- SLOs (example):
  - API p95 < 250ms for metadata reads
  - Playback startup time p95 < 2.5s
  - 99.9% successful segment delivery

---

## 8) Security, Privacy, and Compliance

- Encryption at rest (KMS) + TLS in transit
- Principle of least privilege (service-to-service IAM)
- Signed URLs/tokenized playback for restricted assets
- Privacy controls for watch/search history
- Data retention policies and deletion workflows (user request handling)
- Abuse prevention: bot detection, rate limits, CAPTCHA in high-risk flows

---

## 9) Moderation & Safety Implementation

- **Ingestion checks:** hash matching, banned content signatures
- **ML scanning:** CV/NLP/ASR classifiers on thumbnails, titles, transcripts
- **Risk scoring:** combine model outputs + reporter trust + prior strikes
- **Enforcement:** age restriction, demonetization, limited visibility, takedown, account strikes
- **Human review UI:** queue prioritization by severity and reach

---

## 10) API Surface (Example)

- `POST /v1/channels` create channel
- `GET /v1/channels/{id}` channel profile
- `POST /v1/videos:upload-init` upload session
- `PATCH /v1/videos/{id}` update metadata/privacy
- `POST /v1/videos/{id}:publish` publish video
- `GET /v1/feed/home` personalized feed
- `GET /v1/search?q=...&sort=...&duration=...`
- `POST /v1/videos/{id}/reactions`
- `POST /v1/videos/{id}/comments`
- `POST /v1/channels/{id}/subscribe`

---

## 11) Delivery Plan (Phased)

### Phase 1 (MVP)
- Auth, channels, uploads, playback, subscriptions, likes, comments
- Basic search + non-ML recommendation (subscriptions + trending)

### Phase 2
- ML ranking, advanced creator analytics, playlists/watch later
- Moderation automation + human review tooling

### Phase 3
- Monetization, global multi-region expansion, advanced experimentation platform

---

## 12) Suggested Tech Stack (Example)

- **Frontend:** React/Next.js web, React Native/Flutter mobile
- **Backend:** Go/Java/Node microservices, gRPC + REST gateway
- **Data:** PostgreSQL, Redis, OpenSearch, Kafka, object storage, warehouse
- **Media:** FFmpeg-based transcoding workers, packagers, CDN
- **ML:** Feature store + batch training + online inference service
- **Infra:** Kubernetes + Terraform + observability stack (Prometheus/Grafana/OpenTelemetry)

This architecture provides a practical path from MVP to internet-scale while maintaining clear ownership boundaries between product domains and platform capabilities.
