#!/bin/bash
# Optional: Download Hyperledger Fabric binaries and docker images if not
present
FABRIC_VERSION=${FABRIC_VERSION:-2.5.12}
CA_VERSION=${FABRIC_CA_VERSION:-1.5.15}
BIN_DIR="../bin"
# Check if peer binary exists
if [ ! -f "$BIN_DIR/peer" ]; then
echo "Fabric binaries not found. Downloading binaries and images for
Fabric ${FABRIC_VERSION} ..."
curl -sSL https://raw.githubusercontent.com/hyperledger/fabric/main/
scripts/install-fabric.sh | bash -s -- $FABRIC_VERSION $CA_VERSION
echo "Exporting PATH for binaries"
export PATH=${PWD}/../bin:$PATH
else
echo "Fabric binaries already present."
fi
