# Matrix Dashboard Project Requirements Document

## I. Project Background and Objectives

### Project Background
Based on the Synapse Matrix server infrastructure, an independent management system must be developed for internal network VPS deployment. This system is designed to deliver comprehensive user management, risk control management, and media storage management capabilities without altering Synapse's core chat functionality.

### Core Objectives
Construct a Dashboard management system that operates in coordination with Synapse, implementing user lifecycle management, content moderation, media storage optimization, and security risk control. The system must guarantee that Synapse's fundamental features—including end-to-end encryption, federated communication, and basic chat operations—remain entirely unimpaired.

### Deployment Environment
All services operate exclusively within the internal network, bound to 127.0.0.1, with no external exposure. The Dashboard and Synapse are co-located on the same physical machine, sharing a single PostgreSQL database instance and Redis instance.

---

## II. System Architecture Philosophy

### Principle of Authority Segregation
Synapse functions as the execution engine, while the Dashboard serves as the management controller. Synapse executes all operations according to the current state persisted in the database, including login authentication, message transmission, and file uploads. The Dashboard modifies configuration parameters within the database, such as user status, risk control policies, and storage strategies. Both systems operate independently without direct inter-process communication, coordinating instead through shared database state and Redis message bus.

### Data Consistency Strategy
The Dashboard and Synapse utilize the same PostgreSQL database instance with logical isolation through separate schemas. Synapse employs the default public schema for its native data structures, while the Dashboard uses a dedicated dashboard schema for administrative data. Correlation between systems is maintained through foreign key relationships on user identities.

Redis serves as both caching layer and message bus. Synapse caches user risk control states to optimize performance. Following state modifications, the Dashboard publishes event notifications via Redis Pub/Sub to instruct Synapse to invalidate relevant cache entries. Synapse subscribes to these channels and immediately purges designated caches, ensuring subsequent queries retrieve updated states.

Cache population follows a lazy-loading pattern, with user states loaded into cache upon initial operation. Time-to-live (TTL) values provide a fallback mechanism; cached data automatically expires after predetermined intervals even if Pub/Sub notifications fail. Different data categories have distinct TTL configurations: high-frequency security-sensitive data has shorter TTLs, while low-frequency configuration data has extended TTLs.

---

## III. User Management Requirements

### User Registration Workflow

#### Registration Method Configuration
The Dashboard must provide configuration interfaces to govern registration methodologies. Administrators may select from: complete disabling of automatic registration, exclusive email-verified registration, exclusive mobile-verified registration, or concurrent email and mobile registration.

#### Registration Information Collection
Mandatory registration fields include: unique username, email address, mobile number, password, and password confirmation. Mobile numbers must validate against country formats corresponding to the user's IP address geolocation. The registration process must incorporate CAPTCHA verification using Cloudflare Turnstile.

#### Registration Review Process
With automatic registration enabled, post-submission the system performs: IP reputation analysis, blacklist matching, and device fingerprint verification. Upon passing preliminary checks, if configured for email or mobile verification, the system dispatches verification codes. User input of valid codes triggers automatic account activation.

With automatic registration disabled, users may only submit registration applications without receiving verification codes. Applications enter pending review state, where administrators evaluate and approve/reject via the Dashboard. Approved applications may trigger automated activation email notifications.

#### Registration Blacklist Mechanism
Administrative rejection of registration applications places user information into a blacklist. Blacklisted elements include: username, email address, mobile number, IP address, and device fingerprint. Rejected users receive a generic message: "Account not yet activated, please await administrator activation."

Subsequent registration attempts using identical username, email, or mobile number receive prompts: "This username/email/mobile number has already registered an account." Registrations from identical IPs or device fingerprints surface as successful but undergo automatic banning during subsequent risk control screening.

Administrators may review rejected applications in the Dashboard's trash bin, with capability to re-approve applications—removing them from the blacklist and activating accounts.

### User Group Management

#### User Group Categorization
The system contains four default groups: Free, Standard, Premium, and Enterprise. Groups have differentiated constraints regarding storage quotas, message rates, and functional usage limits.

#### Storage Quotas
Free Group: Text-only message storage.
Standard Group: Non-text file storage with 100MB quota.
Premium Group: 1GB storage quota.
Enterprise Group: 10GB storage quota (configurable for unlimited).

#### Message Rate Limits
Free Group: 10 messages/minute maximum.
Standard Group: 30 messages/minute.
Premium Group: 100 messages/minute.
Enterprise Group: Unlimited.

#### AI Function Limitations
All groups can access AI functionalities with varying daily limits:
Free Group: 10 OCR operations + 10 PDF-to-MD conversions.
Standard Group: 50 of each.
Premium Group: 200 of each.
Enterprise Group: Unlimited.

#### Core Function Guarantee
Text messaging, end-to-end encrypted communication, and basic AI functionalities remain universally accessible across all groups without restriction.

#### User Group Assignment
Group assignment and downgrading are exclusively administrative actions performed via the Dashboard. Users cannot self-upgrade or modify group membership.

---

## IV. Risk Control Framework Requirements

### Risk Control Level Definitions

#### Muting
Users retain login capability, message viewing, and AI/auxiliary function access, but cannot transmit new messages. Muting has explicit duration limits with automatic expiration.

#### Soft Banning
Users can login and view real-time messages from others, but cannot send messages or use supplementary functions. Soft bans may be temporary or permanent. Affected users can interact with the Administrator Bot to initiate appeals.

#### Hard Banning
Login attempts return "Account does not exist" prompts. Active sessions receive immediate connection termination. During hard bans, users may interact with the Administrator Bot through specialized channels for appeals but cannot receive other messages.

Hard-banned users' incoming messages are accepted by Synapse but not delivered, instead queuing in pending delivery. Upon unbanning, messages stream to users synchronously, though server-absent files are skipped.

#### Soft Deletion
Accounts are legally considered deleted while data remains physically stored. Login attempts yield "Account does not exist" prompts. Soft-deleted accounts are generally irrecoverable barring exceptional circumstances.

A 60-day cooling-off period follows soft deletion. During this interval, users may export chat histories and profile data but cannot normally use the account. Appeals via Administrator Bot are disabled during cooling-off. Post-period, data persists with deleted markers.

### Violation Penalty Structure

#### Minor Violations
First offense: 8-hour mute.
Repeated minor violations (2-4 instances): 7-day, 14-day, or 1-month soft ban.
Frequent minor violations (4+ instances): Permanent soft ban, appeals accepted.

#### Standard Violations
First offense: 24-hour mute.
Repeated standard violations: 2-month, 4-month, or 1-year soft ban.
Frequent standard violations: Permanent hard ban, email appeals accepted.

#### Severe Violations
First offense: 72-hour mute.
Repeated severe violations (2-4 instances): 8-month, 2-year hard ban or permanent soft ban, appeals accepted.
Frequent severe violations: Account deletion after 2 months, no appeals.

### Risk Control Execution Mechanism
All risk control operations are initiated by administrators through the Dashboard. Upon selecting control type, duration, and rationale, the Dashboard: updates database records, invalidates Redis caches, and publishes Pub/Sub events. Synapse listeners clear local caches upon event receipt; hard bans additionally trigger internal API calls to terminate active user connections.

Subsequent user operations trigger Synapse database queries for updated status enforcement. During message transmission, Synapse batch-queries risk control statuses for all room members, delivering messages exclusively to non-hard-banned users.

---

## V. Appeal System Requirements

### Appeal Channels

#### Administrator Bot
The system requires an Administrator Bot account serving as user-administrator liaison. The Bot is a genuine Matrix user automatically added to every user's contacts upon registration. Users may block the Bot but can re-enable it when appealing.

The Bot possesses no special chat privileges, primarily collecting appeal information and submitting to the Dashboard. Bot-Dashboard communication occurs via HTTP API with JWT Token authentication. All exchanges require end-to-end encryption.

#### Email Appeals
Permanently hard-banned users unable to access the Bot may appeal via designated email addresses. Email appeals undergo manual administrator processing.

### Appeal Information Collection
When submitting appeals via Bot, the Bot collects: user contact email, appeal justification, incident narrative, etc. Username is automatically captured. The Bot inquires whether users understand the ban reason, promoting violation awareness.

After information assembly, the Bot submits appeal data to the Dashboard API. The Dashboard stores appeal records in the database and notifies administrators for processing.

### Appeal Processing Workflow
Administrators review pending appeals in the Dashboard, selecting approval or rejection. Approval may directly unban users or convert permanent bans to temporary ones. Rejection permits administrative reason specification.

Post-processing, the Bot retrieves outcomes from the Dashboard API and relays results to users via Synapse's messaging API. Messages indicate appeal success/failure and include administrative responses.

### Appeal Frequency Limits
Appeal opportunities are restricted. Temporary bans permit Bot appeals; successful appeals may reduce duration (three instances maximum) or directly unban (twice maximum). Permanent soft bans may convert to temporary bans (twice maximum) or direct unbanning (once). Permanent hard bans allow single email appeal for conversion to temporary ban. Post-conversion appeals are prohibited.

---

## VI. Media Storage Management Requirements

### Storage Policy Design

#### Default Storage Rules
Text messages, event metadata, search indexes, and message receipts require mandatory server-side storage. Thumbnails default to server storage but are configurable. Images, audio, video, and attachments prioritize client-side storage with server metadata retention, though configurable for server storage. End-to-end encrypted key backups store ciphertext only.

#### Policy Override Hierarchy
Storage policies support three scopes: global, room, and user. Precedence descends: user policies override room policies, room policies override global policies. Administrators can configure distinct storage policies per scope via the Dashboard.

### File Deduplication Mechanism
All uploaded files undergo SHA256 content hashing. Pre-upload, the system queries existing identical hashes. Matches trigger direct reference to existing file URLs without re-uploading. Non-matches upload to MinIO object storage.

### Cooling Period Deletion Mechanism
File uploads initiate cooling period timers. During cooling periods, duplicate hash uploads reset the timer. Post-cooling period, unreferenced files delete from MinIO.

Cooling periods vary by group:
Free Group: 7 days
Standard Group: 30 days
Premium Group: 90 days
Enterprise Group: Permanent retention

### End-to-End Encrypted Content Handling
Server inability to decrypt end-to-end encrypted files prevents automated thumbnail generation. If thumbnails are required, clients must upload low-resolution plaintext versions, constrained to ≤320 pixels and ≤50KB file size.

The Dashboard must display risk warnings when configuring this functionality, requiring administrator checkbox confirmation. All plaintext exposure operations mandate pop-up confirmation and audit log recording.

---

## VII. Two-Factor Authentication Requirements

### 2FA Verification Methods

#### Email Verification
Users may select email-based verification code delivery for 2FA. The system utilizes Brevo API for code transmission.

#### TOTP Verification
Users can bind TOTP keys using authenticator applications (e.g., Google Authenticator) for verification.

#### Security Code Verification
During secondary password setup, the system generates 10 random security codes. Users must memorize minimum 4 codes, with download/print options. Security codes constitute a valid 2FA method.

#### Friend Guarantee Verification
Users may undergo 2FA verification through trusted friends. Trusted friends must satisfy: account registration ≥180 days, and friendship duration ≥30 days.

When conventional verification fails, users may request generation of a 10-digit random hash. Users communicate the hash to friends through external channels; friends input username and hash via Bot's `/verify` command. Hash validity: 48 hours.

Successful friend verification initiates a 2-hour revocation period. During this window, friends may revoke verification. Simultaneously, user accounts enter untrusted state—allowing login but blocking historical chat and contact access.

### Secondary Password Design
Users must establish a secondary password distinct from login credentials, dedicated to 2FA verification and Recovery Key management. Secondary password setup requires email or mobile verification. Post-setup, minimum one 2FA method must be configured.

Secondary password modification or recovery necessitates: primary email verification, followed by secondary confirmation via TOTP or friend guarantee verification.

### Device Trust Mechanism
Post-login devices are not inherently trusted. Untrusted devices cannot access historical chats and contacts, effectively behaving as new accounts. Users establish device trust through QR code scanning or original device verification.

Users may opt for 180-day 2FA exemption post-initial login, though disabled by default. Device metadata includes: device ID, device name, trust status, last login timestamp, and IP address.

### Recovery Key Management
Encrypted chat history recovery necessitates Recovery Keys. Recovery Key management mandates secondary password—not login password. This functionality requires prior Recovery Key synchronization to Synapse server.

Users may choose server-side encrypted Recovery Key storage or self-custody. Chat recovery executes exclusively via Recovery Key or trusted device verification.

---

## VIII. Audit and Logging Requirements

### Operation Log Recording
All Dashboard administrator actions must log to operation records. Log fields include: operator ID, operation type (user ban, registration approval, unban, etc.), target user ID, operation details, IP address, and timestamp.

Operation logs persist to the `operation_logs` database table concurrently with filesystem output to `operation.log`. Logs must support CSV export.

### Audit Log Viewing
Administrators can review all operation logs via the Dashboard, supporting filters for time, operator, operation type, target user, etc. Audit logs must flag operations involving privacy risks (e.g., plaintext user data access, sensitive data modification).

### Log Retention Policy
Operation logs require long-term retention, recommended archival to object storage after 2 years. Archived logs remain queryable through the Dashboard without consuming database capacity.

---

## IX. Client Customization Requirements

### Customization Scope
Customizations base on official Element Web client; mobile clients remain unmodified. The customized client exclusively connects to its designated server, while maintaining basic compatibility with official clients for development/testing phases.

### Registration Interface Customization
The client must implement custom registration interfaces including: username, email, mobile number, password fields, and Cloudflare Turnstile CAPTCHA. Registration workflows must integrate with Dashboard registration APIs, displaying appropriate verification methods per Dashboard configuration.

### Login Process Customization
For 2FA-enabled users, the client must display 2FA verification interfaces post-password entry. Users select from email, TOTP, security code, or friend guarantee verification. Login finalizes only after successful verification.

### Account Settings Interface Modification
The client's account settings require new sections for: secondary password configuration, 2FA setup, and device trust management. Sensitive operations (email/mobile modification) require prior secondary password or 2FA verification.

### Recovery Key Interface Modification
Encryption settings interfaces require reorganization. Users must establish secondary passwords before enabling Recovery Key functionality. Recovery Key management utilizes secondary passwords—not login credentials.

### AI Function Integration
The client needs new UI elements (buttons/menu items) for server-side AI function invocation, including OCR and PDF-to-Markdown. These functions call Dashboard APIs subject to user group quotas.

---

## X. Dashboard Frontend Requirements

### Overview Dashboard
Displays holistic system operational status, including: disk usage statistics, storage policy summaries, synchronization queue status, active user counts, pending appeal volumes, and other key metrics.

### User Management Page
Presents comprehensive user lists supporting search/filter by username, email, user group, status, etc. Individual user detail views show: registration timestamp, last login, current risk control status, group membership, device lists, etc.

Administrators may execute user operations: ban, unban, group modification, forced logout, etc. All operations require reason specification and confirmation.

### Policy Management Page
Enables storage policy editing across global, room, and user levels. Policy modifications require administrative password/Token re-authentication. Policy changes trigger synchronization operations.

### Synchronization Management Page
Shows current media synchronization task statuses: queued file counts, synchronized volumes, failure rates, etc. Administrators may manually trigger, pause, or retry synchronization tasks.

### Media Browser Page
Lists metadata for all server-stored media files: content hashes, sizes, types, upload timestamps, reference counts, cooling period expirations, etc. Supports filtering by hash, room, user, etc.

### Appeal Management Page
Displays all pending/processed appeal records. Administrators review appeal details: user-provided contact emails, appeal justifications, incident narratives, etc. Administrators approve/reject appeals with response composition.

### Audit Log Page
Shows historical administrator operation records, filterable by time, operator, operation type, target user, etc. Privacy-risk operations require special annotation. Audit logs support CSV export.

### Registration Application Management Page
When automatic registration is disabled, user-submitted applications appear here. Administrators review application details: username, email, mobile number, registration IP, device fingerprint, etc. Applications receive approval/rejection decisions.

Rejected applications move to trash bin, where administrators may subsequently re-approve.

### Security Prompts and Confirmations
All high-risk operations (plaintext exposure, batch operations, irreversible actions) must trigger modal risk warnings, requiring administrator checkbox acknowledgment and password entry. All confirmations log to audit trails.

---

## XI. Technical Constraints and Non-Functional Requirements

### Performance Requirements
User login and message delivery latency: millisecond range. Cache hit ratio: ≥95%. Room member status queries must utilize batch operations preventing N+1 query issues.

### Security Requirements
All sensitive data transfers require HTTPS or end-to-end encryption. Administrator operations demand comprehensive audit logging. Password storage uses bcrypt encryption. JWT Tokens require appropriate expiration intervals.

### Maintainability Requirements
Dashboard and Synapse modifications must be minimalized to facilitate future upgrades and maintenance. All Synapse alterations require clear commentary markers. Database schemas employ version-controlled migration scripts.

### Scalability Requirements
User group configurations should demonstrate flexibility for future restriction dimension additions. Storage policies should support granular configuration. Risk control levels and penalty structures should allow configuration file adjustments.

### Compatibility Requirements
Customized clients must maintain basic official client compatibility, permitting official client connections for fundamental operations. However, risk control enforcement occurs server-side, unpreventable through official client usage.

---

## XII. Acceptance Criteria

### Core Functionality Verification
Users can register accounts via customized client including CAPTCHA and email verification. Users can login and perform standard chat operations. Administrators can ban users via Dashboard; banned users immediately lose login/messaging capabilities.

### Risk Control Function Verification
Hard-banned users experience immediate connection termination; login attempts show "account does not exist." Messages sent during hard bans buffer appropriately, streaming upon unbanning. Soft-banned users can login but cannot send messages or use auxiliary functions. Muted users retain full functionality except message transmission.

### Appeal Function Verification
Users can submit appeals via Bot; Bot correctly collects and forwards information to Dashboard. Administrators can review/process appeals within Dashboard. Appeal outcomes correctly propagate to users.

### Media Management Verification
File hash deduplication functions pre-upload; duplicate files avoid redundant storage. Cooling period mechanisms operate correctly; duplicate references reset cooling timers. File deletion occurs appropriately post-cooling period.

### 2FA Function Verification
Users can configure secondary passwords and 2FA methods. Login-time 2FA workflows operate correctly. Friend guarantee verification validates friendship duration and account age requirements. Revocation periods function as designed.

### Audit Function Verification
All administrator actions correctly log to audit trails. Audit logs support conditional filtering and export. High-risk operations properly display confirmation dialogs.

### Client Compatibility Verification
Official clients can connect to server for basic operations. Risk control restrictions apply equally to official clients; bans cannot be circumvented via official clients. All customized client enhancements function correctly.