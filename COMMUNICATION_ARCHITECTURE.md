# Communication System Architecture

## System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Templates   │  │  Campaigns   │  │  WhatsApp    │          │
│  │  Management  │  │  Builder     │  │  Setup       │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                  │                   │
│         └─────────────────┼──────────────────┘                   │
│                           │                                      │
└───────────────────────────┼──────────────────────────────────────┘
                            │ REST API + Socket.io
                            │
┌───────────────────────────┼──────────────────────────────────────┐
│                    BACKEND SERVICES                              │
├───────────────────────────┼──────────────────────────────────────┤
│                           │                                      │
│  ┌────────────────────────▼────────────────────────┐            │
│  │         API Controllers & Routes                │            │
│  │  • TemplateController                           │            │
│  │  • CampaignController                           │            │
│  │  • MessageController                            │            │
│  │  • WhatsAppController                           │            │
│  └────────────┬────────────────────────────────────┘            │
│               │                                                  │
│  ┌────────────▼────────────────────────────────────┐            │
│  │           Service Layer                         │            │
│  │                                                  │            │
│  │  ┌─────────────────┐  ┌─────────────────┐      │            │
│  │  │ Template        │  │ Campaign        │      │            │
│  │  │ Service         │  │ Service         │      │            │
│  │  └────────┬────────┘  └────────┬────────┘      │            │
│  │           │                    │                │            │
│  │  ┌────────▼────────────────────▼────────┐      │            │
│  │  │  Message Processing Service          │      │            │
│  │  │  • Variable Substitution             │      │            │
│  │  │  • Template Rendering                │      │            │
│  │  │  • Validation                        │      │            │
│  │  └────────┬─────────────────────────────┘      │            │
│  │           │                                     │            │
│  │  ┌────────▼─────────────────────────────┐      │            │
│  │  │  Message Queue Service (Bull)        │      │            │
│  │  │  • Queue Management                  │      │            │
│  │  │  • Batch Processing                  │      │            │
│  │  │  • Retry Logic                       │      │            │
│  │  └────────┬─────────────────────────────┘      │            │
│  │           │                                     │            │
│  └───────────┼─────────────────────────────────────┘            │
│              │                                                   │
│  ┌───────────▼─────────────────────────────┐                    │
│  │  WhatsApp Service                       │                    │
│  │  • Browser Automation (Puppeteer)       │                    │
│  │  • Session Management                   │                    │
│  │  │  Message Sending                     │                    │
│  │  • Rate Limiting                        │                    │
│  └───────────┬─────────────────────────────┘                    │
│              │                                                   │
└──────────────┼───────────────────────────────────────────────────┘
               │
┌──────────────▼───────────────────────────────────────────────────┐
│                    EXTERNAL SERVICES                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   WhatsApp   │  │    Redis     │  │  PostgreSQL  │          │
│  │     Web      │  │   (Queue)    │  │  (Messages)  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

## Message Flow

```
1. CREATE CAMPAIGN
   User → Frontend → CampaignController → CampaignService
                                            ↓
                                     Create Campaign
                                            ↓
                                    Filter Recipients
                                            ↓
                                  Generate Messages
                                            ↓
                                      Save to DB

2. START CAMPAIGN
   User clicks "Start" → CampaignController.start()
                              ↓
                      Add Messages to Queue (Bull)
                              ↓
                     Queue Worker Picks Up Batch
                              ↓
                  Message Processing Service
                              ↓
              Render Template with Variables
                              ↓
                      WhatsApp Service
                              ↓
                  Send via WhatsApp Web
                              ↓
                  Apply Rate Limiting Delay
                              ↓
                    Update Message Status
                              ↓
              Emit Progress via Socket.io
                              ↓
                      Frontend Updates UI

3. ERROR HANDLING
   Send Failed → Mark as Failed
               ↓
         Increment Retry Count
               ↓
    Retry < Max? → Yes → Back to Queue
               ↓
              No → Mark as Permanently Failed
               ↓
        Notify Admin via Socket.io
```

## Data Model Relationships

```
ConferenceHouse
    ↓
Building
    ↓
Floor
    ↓
Room ←──────────┐
    ↓           │
RoomAssignment  │
    ↓           │
Attendee ───────┼────→ Message ←────── MessageCampaign
                │                            ↓
                └─────────────────→ MessageTemplate
                                            
                                            
AuditLog (tracks all communication actions)

CommunicationSettings (global configuration)
```

## Template Variable Resolution

```
Template:
"مرحباً {{fullName}}! غرفتك في {{buildingName}} - الطابق {{floorNumber}} - غرفة {{roomNumber}}"

Resolution Process:
1. Get Attendee by ID
2. Get RoomAssignment by attendeeId
3. Get Room by roomId
4. Get Floor by floorId
5. Get Building by buildingId

Variable Map:
{
  fullName: attendee.fullName,
  buildingName: building.name,
  floorNumber: floor.floorNumber,
  roomNumber: room.roomNumber,
  // ... all other variables
}

Rendered Output:
"مرحباً أحمد محمد! غرفتك في المبنى الشرقي - الطابق 2 - غرفة 205"
```

## Queue Processing Strategy

```
┌─────────────────────────────────────────┐
│         Message Queue (Redis)           │
│                                         │
│  [Msg1] [Msg2] [Msg3] ... [Msg100]    │
└────────────┬────────────────────────────┘
             │
             │ Worker pulls batch
             ↓
    ┌────────────────┐
    │  Batch (10)    │
    │  Processing    │
    └────────┬───────┘
             │
    ┌────────▼────────┐
    │  Send Msg1      │ ←── Apply 3-8s delay
    │  Status: SENT   │
    └────────┬────────┘
             │
    ┌────────▼────────┐
    │  Send Msg2      │ ←── Apply 3-8s delay
    │  Status: SENT   │
    └────────┬────────┘
             │
            ...
             │
    ┌────────▼────────┐
    │  Send Msg10     │ ←── Apply 3-8s delay
    │  Status: SENT   │
    └────────┬────────┘
             │
    ┌────────▼────────┐
    │  Batch Complete │
    │  Wait 2-5 min   │ ←── Anti-ban pause
    └────────┬────────┘
             │
             │ Pull next batch
             ↓
    Next Batch (10)
```

## WhatsApp Session Management

```
Session Lifecycle:
1. Initialize Browser (Puppeteer)
2. Open WhatsApp Web
3. Generate QR Code
4. User Scans QR
5. Session Authenticated
6. Save Session Data (LocalAuth)
7. Ready to Send Messages

Session Recovery:
- Session data saved to disk
- On restart: Load saved session
- Auto-reconnect if disconnected
- Emit status via Socket.io

Session States:
• DISCONNECTED - No browser
• INITIALIZING - Browser starting
• QR_READY - Waiting for scan
• AUTHENTICATING - QR scanned
• READY - Connected and ready
• ERROR - Connection failed
```

## Rate Limiting Strategy

```
Level 1: Message-Level Delay
• Random delay: 3-8 seconds between messages
• Prevents rapid-fire detection

Level 2: Batch-Level Pause
• Send batch of 10-20 messages
• Pause for 2-5 minutes
• Simulates human behavior

Level 3: Hourly Limit
• Max 100 messages per hour
• Tracks via Redis counter
• Resets every hour

Level 4: Daily Limit
• Max 300 messages per day
• Tracks via database
• Prevents account flags

Level 5: Concurrent Sending
• Only 1 message sending at a time
• Queue-based processing
• No parallel sends
```

## Integration Points

```
┌──────────────────────────────────────────────────────┐
│              Existing System Events                   │
└──────────────────────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ↓                ↓                ↓
┌──────────────┐  ┌─────────────┐  ┌─────────────┐
│   Room       │  │  Check-in   │  │   Payment   │
│  Assignment  │  │   System    │  │   System    │
└──────┬───────┘  └──────┬──────┘  └──────┬──────┘
       │                 │                 │
       │  Trigger Auto   │                 │
       │  Messages       │                 │
       │                 │                 │
       └────────────┬────┴─────────────────┘
                    │
                    ↓
        ┌───────────────────────┐
        │  Communication System │
        │  • Find Template      │
        │  • Render Message     │
        │  • Add to Queue       │
        │  • Send               │
        └───────────────────────┘
```

## Security Layers

```
Layer 1: Authentication
• User must be logged in
• Role-based access control
• Admin-only for campaign creation

Layer 2: Authorization
• Check user permissions
• Verify resource ownership
• Audit all actions

Layer 3: Data Validation
• Validate phone numbers
• Sanitize message content
• Check attachment types

Layer 4: Rate Limiting
• API rate limits
• WhatsApp rate limits
• Queue overflow protection

Layer 5: Encryption
• Encrypt sensitive data at rest
• HTTPS for API calls
• Secure session storage

Layer 6: Audit Trail
• Log all communication actions
• Track message delivery
• Monitor for abuse
```

## Performance Optimization

```
Database Optimization:
• Index on message status
• Index on campaign status
• Index on attendee phone
• Composite indexes for queries

Queue Optimization:
• Redis for fast queue operations
• Batch processing
• Parallel workers (future)
• Queue prioritization

WhatsApp Optimization:
• Session persistence
• Connection pooling (future)
• Lazy browser initialization
• Headless mode

Frontend Optimization:
• Pagination for large lists
• Virtual scrolling
• Lazy loading
• WebSocket for real-time updates
```

## Monitoring Dashboard

```
┌─────────────────────────────────────────┐
│       Communication Dashboard           │
├─────────────────────────────────────────┤
│                                         │
│  Today's Activity                       │
│  ├─ Messages Sent: 145                 │
│  ├─ Messages Failed: 3                 │
│  ├─ Delivery Rate: 98%                 │
│  └─ Active Campaigns: 2                │
│                                         │
│  Queue Status                           │
│  ├─ Pending: 25                        │
│  ├─ Processing: 1                      │
│  └─ Failed (retry): 2                  │
│                                         │
│  WhatsApp Status                        │
│  ├─ Session: Connected ✓               │
│  ├─ Last Message: 2 min ago            │
│  └─ Rate Limit: 45/100 (hourly)        │
│                                         │
│  Recent Campaigns                       │
│  ├─ Room Assignments: 87/100 sent      │
│  ├─ Check-in Reminders: Completed      │
│  └─ Payment Follow-up: Scheduled       │
│                                         │
└─────────────────────────────────────────┘
```

## Error Recovery Flow

```
Error Detected
    ↓
Log Error Details
    ↓
Classify Error Type
    ↓
┌───────────┬───────────┬────────────┐
↓           ↓           ↓            ↓
Network   WhatsApp   Validation   System
Error     Banned     Error        Error
↓           ↓           ↓            ↓
Retry     Pause       Skip         Alert
3x        Campaign    Message      Admin
↓           ↓           ↓            ↓
Success?  Wait         Mark         Manual
          24h         Failed       Review
↓           ↓           ↓            ↓
Yes → Mark Sent       Log          Fix
No → Mark Failed      Error        Issue
```

## Deployment Checklist

```
Infrastructure:
□ Redis server running
□ PostgreSQL migrations applied
□ Chrome/Chromium installed
□ Node.js 18+ installed
□ Environment variables configured

Backend:
□ Dependencies installed
□ Database schema updated
□ Redis connection verified
□ Socket.io configured
□ Bull workers started

Frontend:
□ Dependencies installed
□ API endpoints configured
□ WebSocket connected
□ Navigation updated

Testing:
□ Unit tests passing
□ Integration tests passing
□ WhatsApp test account
□ Test message sent successfully

Monitoring:
□ Error logging configured
□ Queue monitoring active
□ Performance metrics tracked
□ Alerts configured

Documentation:
□ API docs updated
□ User guide created
□ Admin guide created
□ Troubleshooting guide
```
