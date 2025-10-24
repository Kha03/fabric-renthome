#!/bin/bash
# Upgrade chaincode sequence (after chaincode code update)

# Set PATH to include Fabric binaries
export PATH=${PWD}/../bin:$PATH

# Set Fabric config path
export FABRIC_CFG_PATH=${PWD}/../config

CHANNEL_NAME="rentalchannel"
CC_NAME="real-estate-cc"
NEW_VERSION="2.4.3"
NEW_SEQUENCE=6
CC_LABEL="${CC_NAME}_${NEW_VERSION}"
CC_PATH="../chaincode/real-estate-cc"
CC_LANG="node"
COLLECTION_CONFIG="${CC_PATH}/collections_config.json"

echo "Packaging new chaincode version ${NEW_VERSION}..."
peer lifecycle chaincode package ${CC_NAME}_${NEW_VERSION}.tar.gz --path ${CC_PATH} --lang ${CC_LANG} --label ${CC_LABEL}

# Install on each peer (OrgProp as example, use loop for all as above)
export CORE_PEER_LOCALMSPID=OrgPropMSP
export CORE_PEER_MSPCONFIGPATH=../organizations/peerOrganizations/orgprop.example.com/users/Admin@orgprop.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_TLS_ROOTCERT_FILE=../organizations/peerOrganizations/orgprop.example.com/peers/peer0.orgprop.example.com/tls/ca.crt
peer lifecycle chaincode install ${CC_NAME}_${NEW_VERSION}.tar.gz
PKG_ID=$(peer lifecycle chaincode queryinstalled | sed -n "/${CC_LABEL}/{s/^Package ID: //; s/, Label:.*$//; p;}")
echo "New package ID: ${PKG_ID}"

# Install on other peers...
export CORE_PEER_LOCALMSPID=OrgTenantMSP
export CORE_PEER_MSPCONFIGPATH=../organizations/peerOrganizations/orgtenant.example.com/users/Admin@orgtenant.example.com/msp
export CORE_PEER_ADDRESS=localhost:8051
export CORE_PEER_TLS_ROOTCERT_FILE=../organizations/peerOrganizations/orgtenant.example.com/peers/peer0.orgtenant.example.com/tls/ca.crt
peer lifecycle chaincode install ${CC_NAME}_${NEW_VERSION}.tar.gz

export CORE_PEER_LOCALMSPID=OrgLandlordMSP
export CORE_PEER_MSPCONFIGPATH=../organizations/peerOrganizations/orglandlord.example.com/users/Admin@orglandlord.example.com/msp
export CORE_PEER_ADDRESS=localhost:9051
export CORE_PEER_TLS_ROOTCERT_FILE=../organizations/peerOrganizations/orglandlord.example.com/peers/peer0.orglandlord.example.com/tls/ca.crt
peer lifecycle chaincode install ${CC_NAME}_${NEW_VERSION}.tar.gz

# Approve new sequence for each org
for ORG in OrgPropMSP OrgTenantMSP OrgLandlordMSP; do
  case $ORG in
    OrgPropMSP)
      export CORE_PEER_LOCALMSPID=OrgPropMSP
      export CORE_PEER_MSPCONFIGPATH=../organizations/peerOrganizations/orgprop.example.com/users/Admin@orgprop.example.com/msp
      export CORE_PEER_ADDRESS=localhost:7051
      export CORE_PEER_TLS_ROOTCERT_FILE=../organizations/peerOrganizations/orgprop.example.com/peers/peer0.orgprop.example.com/tls/ca.crt
      ;;
    OrgTenantMSP)
      export CORE_PEER_LOCALMSPID=OrgTenantMSP
      export CORE_PEER_MSPCONFIGPATH=../organizations/peerOrganizations/orgtenant.example.com/users/Admin@orgtenant.example.com/msp
      export CORE_PEER_ADDRESS=localhost:8051
      export CORE_PEER_TLS_ROOTCERT_FILE=../organizations/peerOrganizations/orgtenant.example.com/peers/peer0.orgtenant.example.com/tls/ca.crt
      ;;
    OrgLandlordMSP)
      export CORE_PEER_LOCALMSPID=OrgLandlordMSP
      export CORE_PEER_MSPCONFIGPATH=../organizations/peerOrganizations/orglandlord.example.com/users/Admin@orglandlord.example.com/msp
      export CORE_PEER_ADDRESS=localhost:9051
      export CORE_PEER_TLS_ROOTCERT_FILE=../organizations/peerOrganizations/orglandlord.example.com/peers/peer0.orglandlord.example.com/tls/ca.crt
      ;;
  esac
  echo "Approving chaincode upgrade for ${ORG}..."
  peer lifecycle chaincode approveformyorg -o localhost:7050 --ordererTLSHostnameOverride orderer1.ordererorg.example.com --channelID $CHANNEL_NAME --name $CC_NAME --version $NEW_VERSION --package-id $PKG_ID --sequence $NEW_SEQUENCE --signature-policy "OR('OrgPropMSP.peer','OrgTenantMSP.peer','OrgLandlordMSP.peer')" --collections-config $COLLECTION_CONFIG --tls --cafile ../organizations/ordererOrganizations/ordererorg.example.com/orderers/orderer1.ordererorg.example.com/tls/ca.crt
done

peer lifecycle chaincode commit -o localhost:7050 --ordererTLSHostnameOverride orderer1.ordererorg.example.com --channelID $CHANNEL_NAME --name $CC_NAME --version $NEW_VERSION --sequence $NEW_SEQUENCE --signature-policy "OR('OrgPropMSP.peer','OrgTenantMSP.peer','OrgLandlordMSP.peer')" --collections-config $COLLECTION_CONFIG --tls --cafile ../organizations/ordererOrganizations/ordererorg.example.com/orderers/orderer1.ordererorg.example.com/tls/ca.crt \
--peerAddresses localhost:7051 --tlsRootCertFiles ../organizations/peerOrganizations/orgprop.example.com/peers/peer0.orgprop.example.com/tls/ca.crt \
--peerAddresses localhost:8051 --tlsRootCertFiles ../organizations/peerOrganizations/orgtenant.example.com/peers/peer0.orgtenant.example.com/tls/ca.crt \
--peerAddresses localhost:9051 --tlsRootCertFiles ../organizations/peerOrganizations/orglandlord.example.com/peers/peer0.orglandlord.example.com/tls/ca.crt
