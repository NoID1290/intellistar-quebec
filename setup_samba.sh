#!/usr/bin/env bash
set -e

echo "=========================================="
echo " Setting up Samba Share for /home/deck/app"
echo "=========================================="
echo

# 1. Update /etc/samba/smb.conf
echo "[1/3] Updating /etc/samba/smb.conf..."
sudo tee /etc/samba/smb.conf > /dev/null << 'CONFIG_EOF'
[global]
   workgroup = WORKGROUP
   server string = SteamDeck Samba
   security = user
   map to guest = Bad User

[app]
   comment = App Folder
   path = /home/deck/app
   browseable = yes
   read only = no
   writable = yes
   valid users = deck
   create mask = 0775
   directory mask = 0775
CONFIG_EOF

echo "✓ Configuration file updated."
echo

# 2. Add/update deck in Samba's password database
echo "[2/3] Setting Samba password for user 'deck'..."
echo "Please set your Samba password (you will enter it twice):"
sudo smbpasswd -a deck
echo "✓ Samba password set."
echo

# 3. Restart Samba daemon
echo "[3/3] Restarting Samba service..."
sudo systemctl restart smb
echo "✓ Samba service restarted."
echo

echo "=========================================="
echo " 🎉 Setup Complete!"
echo "=========================================="
echo "You can now connect from your other Linux PC:"
echo "  URL:      smb://10.0.0.205/app"
echo "            or smb://steamdeck.local/app"
echo "  Username: deck"
echo "  Password: (the password you just entered)"
echo "=========================================="
echo
read -p "Press [Enter] to exit..."
