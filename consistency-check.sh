#!/bin/bash

echo "======================================"
echo "  ASSURCLAIR CONSISTENCY CHECK"
echo "======================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

# Function to print status
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $2"
    else
        echo -e "${RED}✗${NC} $2"
        ERRORS=$((ERRORS + 1))
    fi
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
    WARNINGS=$((WARNINGS + 1))
}

echo "1. Checking Repository Structure"
echo "-----------------------------------"

# Check if key directories exist
[ -d "BackEnd" ] && print_status 0 "BackEnd directory exists" || print_status 1 "BackEnd directory missing"
[ -d "FrontEnd" ] && print_status 0 "FrontEnd directory exists" || print_status 1 "FrontEnd directory missing"
[ -d "BackEnd/src" ] && print_status 0 "BackEnd/src directory exists" || print_status 1 "BackEnd/src directory missing"
[ -d "FrontEnd/components" ] && print_status 0 "FrontEnd/components directory exists" || print_status 1 "FrontEnd/components directory missing"

echo ""
echo "2. Checking Configuration Files"
echo "-----------------------------------"

# Check if configuration files exist
[ -f "BackEnd/package.json" ] && print_status 0 "BackEnd package.json exists" || print_status 1 "BackEnd package.json missing"
[ -f "FrontEnd/package.json" ] && print_status 0 "FrontEnd package.json exists" || print_status 1 "FrontEnd package.json missing"
[ -f "BackEnd/tsconfig.json" ] && print_status 0 "BackEnd tsconfig.json exists" || print_status 1 "BackEnd tsconfig.json missing"
[ -f "FrontEnd/tsconfig.json" ] && print_status 0 "FrontEnd tsconfig.json exists" || print_status 1 "FrontEnd tsconfig.json missing"
[ -f ".gitignore" ] && print_status 0 ".gitignore exists" || print_status 1 ".gitignore missing"
[ -f "docker-compose.yml" ] && print_status 0 "docker-compose.yml exists" || print_status 1 "docker-compose.yml missing"

# Check for environment examples
[ -f "BackEnd/.env.example" ] && print_status 0 "BackEnd .env.example exists" || print_warning "BackEnd .env.example missing"
[ -f "FrontEnd/.env.example" ] && print_status 0 "FrontEnd .env.example exists" || print_warning "FrontEnd .env.example missing"
[ -f ".env.example" ] && print_status 0 "Root .env.example exists" || print_status 0 "Root .env.example not required"

echo ""
echo "3. Checking Documentation"
echo "-----------------------------------"

[ -f "README.md" ] && print_status 0 "README.md exists" || print_warning "README.md missing"
[ -f "COHERENCE.md" ] && print_status 0 "COHERENCE.md exists" || print_status 0 "COHERENCE.md (optional)"
[ -f "ARCHITECTURE.md" ] && print_status 0 "ARCHITECTURE.md exists" || print_status 0 "ARCHITECTURE.md (optional)"

echo ""
echo "4. Checking TypeScript Compilation"
echo "-----------------------------------"

# Check if node_modules exist, install if not
if [ ! -d "BackEnd/node_modules" ]; then
    print_warning "BackEnd dependencies not installed (npm install needed)"
else
    print_status 0 "BackEnd dependencies installed"
    
    # Try to compile backend
    cd BackEnd
    npm run build > /tmp/backend-build.log 2>&1
    if [ $? -eq 0 ]; then
        print_status 0 "BackEnd TypeScript compiles successfully"
    else
        print_status 1 "BackEnd TypeScript compilation failed (see /tmp/backend-build.log)"
    fi
    cd ..
fi

if [ ! -d "FrontEnd/node_modules" ]; then
    print_warning "FrontEnd dependencies not installed (npm install needed)"
else
    print_status 0 "FrontEnd dependencies installed"
    
    # Try to compile frontend  
    cd FrontEnd
    npm run build > /tmp/frontend-build.log 2>&1
    if [ $? -eq 0 ]; then
        print_status 0 "FrontEnd builds successfully"
    else
        print_status 1 "FrontEnd build failed (see /tmp/frontend-build.log)"
    fi
    cd ..
fi

echo ""
echo "5. Checking Security"
echo "-----------------------------------"

# Check for .env files in git
if git ls-files | grep -q "\.env$"; then
    print_status 1 ".env file is tracked in git (security risk!)"
else
    print_status 0 "No .env files tracked in git"
fi

# Check for common secret patterns
if git ls-files | xargs grep -l "password.*=.*['\"]" 2>/dev/null | grep -v ".example" | grep -v "test-" | head -1 > /dev/null; then
    print_warning "Found potential hardcoded passwords (review needed)"
else
    print_status 0 "No obvious hardcoded passwords found"
fi

echo ""
echo "6. Checking Git Status"
echo "-----------------------------------"

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    print_warning "There are uncommitted changes"
    UNCOMMITTED_COUNT=$(git status --porcelain | wc -l)
    echo "   Files changed: $UNCOMMITTED_COUNT"
else
    print_status 0 "No uncommitted changes"
fi

# Check node_modules in git
TRACKED_NODE_MODULES=$(git ls-files | grep "node_modules/" | wc -l)
if [ "$TRACKED_NODE_MODULES" -gt 0 ]; then
    print_warning "node_modules files are tracked in git ($TRACKED_NODE_MODULES files)"
else
    print_status 0 "node_modules not tracked in git"
fi

# Check dist in git
TRACKED_DIST=$(git ls-files | grep "/dist/" | wc -l)
if [ "$TRACKED_DIST" -gt 0 ]; then
    print_status 0 "dist files are tracked (intentional for deployment: $TRACKED_DIST files)"
else
    print_status 0 "No dist files tracked"
fi

echo ""
echo "======================================"
echo "  SUMMARY"
echo "======================================"

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ Application is CONSISTENT${NC}"
    echo "No errors or warnings found."
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ Application is MOSTLY CONSISTENT${NC}"
    echo "Found $WARNINGS warning(s), but no critical errors."
    exit 0
else
    echo -e "${RED}✗ Application has INCONSISTENCIES${NC}"
    echo "Found $ERRORS error(s) and $WARNINGS warning(s)."
    exit 1
fi
