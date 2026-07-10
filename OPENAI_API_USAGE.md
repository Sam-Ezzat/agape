# OpenAI API Usage Analysis

## Current Implementation (With Your Data)

### Stage 3: Classify Rooming Notes
**Purpose**: Extract structured data from free-text rooming notes (Arabic/English)

**API Calls**: 
- **With Caching** (Current): Only unique rooming notes
  - 66 attendees → ~10-30 unique notes (many attendees share similar notes like "لا يوجد")
  - **Estimated: 15-25 API calls**

- **Without Caching** (Old): Every attendee
  - 66 attendees → 66 API calls ❌

**Optimization**: 
- ✅ Cache identical notes (case-insensitive)
- ✅ Skip empty notes (no API call)
- ✅ 100ms delay between calls (rate limit protection)

### Stage 4.5: AI Group Enhancement
**Purpose**: Semantic compatibility analysis for better grouping

**API Calls**:
- Batches of 50 attendees per API call
- 66 attendees ÷ 50 = **2 batches** (50 + 16)
- **Exact: 2 API calls**

---

## Total API Requests Per Auto-Assignment Run

### For 66 Attendees (Current Data):
```
Stage 3 (Classify):     15-25 calls  (depends on unique notes)
Stage 4.5 (Enhance):     2 calls      (fixed batches)
─────────────────────────────────────
Total:                  17-27 calls
```

### Scaling Calculations:

| Attendees | Unique Notes (est) | Stage 3 Calls | Stage 4.5 Calls | **Total** |
|-----------|-------------------|---------------|-----------------|-----------|
| 50        | 12-20             | 12-20         | 1               | **13-21** |
| 66        | 15-25             | 15-25         | 2               | **17-27** |
| 100       | 20-35             | 20-35         | 2               | **22-37** |
| 150       | 30-50             | 30-50         | 3               | **33-53** |
| 200       | 40-65             | 40-65         | 4               | **44-69** |
| 500       | 80-150            | 80-150        | 10              | **90-160** |

---

## Cost Estimation (GPT-4o-mini)

**Pricing**: ~$0.15 per 1M input tokens, ~$0.60 per 1M output tokens

### Per Request Estimate:
- **Stage 3** (Classify): ~500 input + 200 output tokens = **$0.0002 per call**
- **Stage 4.5** (Enhance): ~4000 input + 1500 output tokens = **$0.0018 per call**

### Cost Per Run (66 attendees):
```
Stage 3:     20 calls × $0.0002 = $0.004
Stage 4.5:    2 calls × $0.0018 = $0.0036
─────────────────────────────────────
Total:                          $0.0076  (~$0.01 per run)
```

### Monthly Usage (example):
- 10 dry runs per day × 30 days = 300 runs
- 300 × $0.0076 = **$2.28/month**

---

## Rate Limit Handling

### OpenAI Free Tier Limits:
- **3 requests per minute (RPM)**
- **200 requests per day (RPD)**

### Our Protection:
1. **100ms delay** between Stage 3 calls (max 10 req/sec → throttled to ~1 req/sec)
2. **Caching** reduces duplicate classifications
3. **Graceful fallback** to keyword classification on 429 errors
4. **60-second cooldown** after rate limit hit

### Time Per Run:
- Stage 3: 20 unique notes × 100ms delay + ~2s per call = **~42 seconds**
- Stage 4.5: 2 batches × ~5s per call = **~10 seconds**
- **Total: ~60 seconds with AI** (vs ~5 seconds keyword-only)

---

## Recommendations

### Option 1: Keep AI Enabled (Current)
✅ Better semantic understanding  
✅ Implicit compatibility detection  
✅ Graceful fallback on quota issues  
⚠️ Requires OpenAI credits ($5 minimum)  
⚠️ Slower execution (~60s vs 5s)

### Option 2: Disable AI Temporarily
Set `OPENAI_ENABLED="false"` in `.env`  
✅ Zero API costs  
✅ Fast execution (~5s)  
✅ Still very good results with rule-based logic  
❌ No semantic understanding  
❌ Misses implicit compatibility

### Option 3: Hybrid Approach
- Use AI for initial dry runs (tune settings)
- Disable AI for execution (faster, no cost)
- Re-enable for complex cases

---

## Current Status

**Configuration**: `OPENAI_ENABLED="true"` ✅  
**API Key**: Set (check quota at https://platform.openai.com/usage)  
**Rate Limiting**: Active (100ms delay)  
**Caching**: Active (reduces calls by ~50-70%)  
**Fallback**: Active (continues on quota exhaustion)

**Estimated API Calls Per Run**: 17-27 calls  
**Estimated Cost Per Run**: ~$0.01  
**Estimated Time Per Run**: ~60 seconds
