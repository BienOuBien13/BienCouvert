# Remaining Scripts to Update

The following scripts still contain hardcoded database credentials and need to be updated to use `test-config.js`:

## Database Scripts (need test-config.js)
- [ ] check-schema.js
- [ ] check-tables.js
- [ ] check-vm-backend.js
- [ ] create-policy-embeddings-table.js
- [ ] create-schema.js
- [ ] diagnose-500.js
- [ ] diagnose-biencouvert.js
- [ ] fix-empty-lastnames.js
- [ ] fix-users-name-column.js
- [ ] fix-users-table.js
- [ ] link-policy-to-cg.js
- [ ] migrate-add-cg-link.js
- [ ] migrate-users-names.js
- [ ] normalize-policies-types.js
- [ ] normalize-types.js
- [ ] seed-central-cg.sql (SQL file - uses variables)
- [ ] test-api-central-cg.js
- [ ] test-api-update.js
- [ ] test-central-cg-query.js
- [ ] test-central-cg.js
- [ ] test-gemini-models.js
- [ ] test-pdf-vectorization.js
- [ ] test-register.js
- [ ] test-user-update.js
- [ ] vectorize-existing-cg.js
- [ ] vectorize-pdf.js
- [ ] view-vectorized-db.js

## Already Fixed ✅
- [x] test-coherence.js - Uses test-config.js
- [x] add-gemini-consent.js - Uses test-config.js
- [x] check-api-key.js - Uses environment variables

## Instructions

To update each script:

1. Add at the top:
```javascript
const config = require('./test-config');
```

2. Replace hardcoded connection with:
```javascript
const pool = new Pool(config.dbConfig);
// or
const client = new Client(config.dbConfig);
```

3. For API keys (like Gemini):
```javascript
require('dotenv').config();
const apiKey = process.env.GEMINI_API_KEY;
```

4. Test the script with proper .env configuration

## Priority

**High Priority** (used frequently):
- check-schema.js
- check-tables.js
- test-central-cg.js
- test-register.js

**Medium Priority** (migration/setup scripts):
- create-schema.js
- migrate-*.js
- normalize-*.js

**Low Priority** (diagnostic/one-time scripts):
- diagnose-*.js
- fix-*.js
- view-*.js
