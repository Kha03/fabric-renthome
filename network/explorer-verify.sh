#!/bin/bash

# Script to verify Explorer is showing all network components

echo "=========================================="
echo "Verifying Explorer Configuration"
echo "=========================================="
echo ""

# Check if Explorer is running
if ! docker ps | grep -q explorer.mynetwork.com; then
    echo "❌ Explorer is not running!"
    echo "Run: ./explorer-up.sh"
    exit 1
fi

echo "✓ Explorer container is running"
echo ""

# Check database contents
echo "Database Statistics:"
echo "-------------------"
docker exec explorerdb.mynetwork.com psql -U hppoc -d fabricexplorer -c "
SELECT 
    'Blocks' as component, 
    COUNT(*)::text as count 
FROM blocks 
UNION 
SELECT 'Transactions', COUNT(*)::text 
FROM transactions 
UNION 
SELECT 'Peers', COUNT(*)::text 
FROM peer WHERE peer_type='PEER' 
UNION 
SELECT 'Orderers', COUNT(*)::text 
FROM peer WHERE peer_type='ORDERER'
UNION
SELECT 'Total Nodes', COUNT(*)::text
FROM peer
ORDER BY component;
"

echo ""
echo "Network Components:"
echo "-------------------"
docker exec explorerdb.mynetwork.com psql -U hppoc -d fabricexplorer -c "
SELECT 
    peer_type as type,
    server_hostname as hostname,
    mspid as \"MSP ID\"
FROM peer 
WHERE network_name='real-estate-network'
ORDER BY peer_type DESC, server_hostname;
"

echo ""
echo "Peers in Channel 'rentalchannel':"
echo "---------------------------------"
docker exec explorerdb.mynetwork.com psql -U hppoc -d fabricexplorer -c "
SELECT 
    prc.peerid as peer,
    c.name as channel
FROM peer_ref_channel prc
JOIN channel c ON prc.channelid = c.channel_genesis_hash
WHERE prc.peerid LIKE 'peer0%'
ORDER BY prc.peerid;
"

echo ""
echo "=========================================="
echo "✅ Explorer Verification Complete!"
echo "=========================================="
echo ""
echo "Expected results:"
echo "  - 3 Peers (OrgProp, OrgTenant, OrgLandlord)"
echo "  - 1 Orderer"
echo "  - Total: 4 Nodes"
echo "  - All 3 peers in 'rentalchannel'"
echo ""
echo "Access Explorer at: http://localhost:8080"
echo "Username: exploreradmin"
echo "Password: exploreradminpw"
echo ""
