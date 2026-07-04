#!/bin/bash
# Setup test users for the SecureChat app

BASE_URL="http://localhost:3000"

echo "=== Logging in as admin ==="
ADMIN_RESP=$(curl -s "$BASE_URL/api/auth/login" -H "Content-Type: application/json" -d '{"uniqueId":"95177555","password":"admin123"}')
ADMIN_TOKEN=$(echo "$ADMIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
echo "Admin logged in"

echo ""
echo "=== Creating invite code 1 ==="
INVITE1=$(curl -s "$BASE_URL/api/admin/invites" -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" -X POST -d '{}')
CODE1=$(echo "$INVITE1" | python3 -c "import sys,json; print(json.load(sys.stdin)['code'])")
echo "Invite code 1: $CODE1"

echo ""
echo "=== Creating invite code 2 ==="
INVITE2=$(curl -s "$BASE_URL/api/admin/invites" -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" -X POST -d '{}')
CODE2=$(echo "$INVITE2" | python3 -c "import sys,json; print(json.load(sys.stdin)['code'])")
echo "Invite code 2: $CODE2"

echo ""
echo "=== Registering User: Alice ==="
ALICE=$(curl -s "$BASE_URL/api/auth/register" -H "Content-Type: application/json" -d "{\"inviteCode\":\"$CODE1\",\"displayName\":\"Alice\",\"password\":\"test123\"}")
ALICE_ID=$(echo "$ALICE" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['uniqueId'])")
echo "Alice registered with ID: $ALICE_ID"

echo ""
echo "=== Registering User: Bob ==="
BOB=$(curl -s "$BASE_URL/api/auth/register" -H "Content-Type: application/json" -d "{\"inviteCode\":\"$CODE2\",\"displayName\":\"Bob\",\"password\":\"test123\"}")
BOB_ID=$(echo "$BOB" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['uniqueId'])")
echo "Bob registered with ID: $BOB_ID"

echo ""
echo "==============================="
echo "TEST USERS READY:"
echo "  Admin: 95177555 / admin123"
echo "  Alice: $ALICE_ID / test123"
echo "  Bob:   $BOB_ID / test123"
echo ""
echo "Use these ID numbers in the app's 'Add Contact' dialog!"
echo "==============================="
