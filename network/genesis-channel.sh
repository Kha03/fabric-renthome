#!/bin/bash
# Generate genesis block for rentalchannel using configtxgen
export FABRIC_CFG_PATH=${PWD}/../config
CHANNEL_NAME="rentalchannel"
PROFILE="RentalChannel"
OUTPUT_BLOCK="../organizations/rentalchannel.genesis.block"

echo "Generating channel genesis block '${OUTPUT_BLOCK}'..."
../bin/configtxgen -profile ${PROFILE} -channelID ${CHANNEL_NAME} -outputBlock ${OUTPUT_BLOCK}
res=$?
if [ $res -ne 0 ]; then
  echo "Failed to generate channel genesis block"
  exit 1
fi
echo "Genesis block generated."
