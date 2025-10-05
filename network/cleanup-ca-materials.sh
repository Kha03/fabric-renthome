#!/bin/bash
set -e

CA_ORGS=(ordererOrg orgProp orgTenant orgLandlord)
BASE_DIR="../organizations/fabric-ca"

for ORG in "${CA_ORGS[@]}"; do
  echo "Cleaning CA materials for $ORG..."
  sudo rm -f "$BASE_DIR/$ORG/ca-cert.pem"
  sudo rm -rf "$BASE_DIR/$ORG/msp"
  sudo rm -f "$BASE_DIR/$ORG/fabric-ca-server.db"
done

echo "Done. All CA signing materials cleaned (except TLS)."