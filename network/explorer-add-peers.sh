#!/bin/bash

# Script to add all peers to Explorer database
# This ensures all 3 peers are visible in the Explorer UI

echo "=========================================="
echo "Adding all peers to Explorer database"
echo "=========================================="

# Wait for Explorer to start
sleep 15

# Get channel genesis hash
GENESIS_HASH=$(docker exec explorerdb.mynetwork.com psql -U hppoc -d fabricexplorer -t -c "SELECT channel_genesis_hash FROM channel WHERE name='rentalchannel' AND network_name='real-estate-network';" | xargs)

if [ -z "$GENESIS_HASH" ]; then
    echo "❌ Error: Could not get channel genesis hash"
    exit 1
fi

echo "✓ Channel genesis hash: $GENESIS_HASH"

# Check if peers already exist
PEER_COUNT=$(docker exec explorerdb.mynetwork.com psql -U hppoc -d fabricexplorer -t -c "SELECT COUNT(*) FROM peer WHERE network_name='real-estate-network' AND peer_type='PEER';" | xargs)

echo "Current peer count in database: $PEER_COUNT"

if [ "$PEER_COUNT" -ge "3" ]; then
    echo "✓ All 3 peers already in database"
else
    echo "Adding missing peers..."
    
    # Add OrgTenant peer if not exists
    docker exec explorerdb.mynetwork.com psql -U hppoc -d fabricexplorer -c "
    INSERT INTO peer (channel_genesis_hash, mspid, requests, events, server_hostname, peer_type, network_name, createdt)
    SELECT '$GENESIS_HASH', 'OrgTenantMSP', 'peer0.orgtenant.example.com:8051', 'peer0.orgtenant.example.com:8051', 'peer0.orgtenant.example.com:8051', 'PEER', 'real-estate-network', NOW()
    WHERE NOT EXISTS (SELECT 1 FROM peer WHERE server_hostname='peer0.orgtenant.example.com:8051' AND network_name='real-estate-network');
    " > /dev/null
    
    # Add OrgLandlord peer if not exists
    docker exec explorerdb.mynetwork.com psql -U hppoc -d fabricexplorer -c "
    INSERT INTO peer (channel_genesis_hash, mspid, requests, events, server_hostname, peer_type, network_name, createdt)
    SELECT '$GENESIS_HASH', 'OrgLandlordMSP', 'peer0.orglandlord.example.com:9051', 'peer0.orglandlord.example.com:9051', 'peer0.orglandlord.example.com:9051', 'PEER', 'real-estate-network', NOW()
    WHERE NOT EXISTS (SELECT 1 FROM peer WHERE server_hostname='peer0.orglandlord.example.com:9051' AND network_name='real-estate-network');
    " > /dev/null
    
    echo "✓ Peers added successfully"
fi

# Verify all peers are in database
echo ""
echo "Peers in database:"
docker exec explorerdb.mynetwork.com psql -U hppoc -d fabricexplorer -c "SELECT server_hostname, mspid FROM peer WHERE network_name='real-estate-network' AND peer_type='PEER' ORDER BY server_hostname;"

echo ""
echo "✓ Restarting Explorer to refresh UI..."
docker restart explorer.mynetwork.com > /dev/null

sleep 5

echo ""
echo "=========================================="
echo "✅ All 3 peers are now visible in Explorer!"
echo "=========================================="
echo ""
echo "Access Explorer at: http://localhost:8080"
echo "Username: exploreradmin"
echo "Password: exploreradminpw"
echo ""
