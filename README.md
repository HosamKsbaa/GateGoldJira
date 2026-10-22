# GateGoldJira

Enterprise-grade work-management system featuring a Go backend monolith, modern Angular SPA frontend, and dual REST + MCP (Model Context Protocol) AI assistant interfaces.

---

## Antigravity Plugin & Sidecar Installation

The GateGoldJira extension includes an interactive side panel and 133 MCP tools for AI pair programming.

### 🐧 Linux & macOS

#### Method A: Using GitHub CLI (`gh`) (Works for Private & Public Repo)
```bash
# 1. Download the release archive
gh release download v1.0.0-plugin --repo HosamKsbaa/GateGoldJira --pattern "*.tar.gz" --dir /tmp/gategoldjira

# 2. Extract into Antigravity plugins directory
mkdir -p ~/.gemini/config/plugins
tar -xzf /tmp/gategoldjira/gategoldjira-plugin-v1.0.0.tar.gz -C ~/.gemini/config/plugins/

# 3. Clean up temporary files
rm -rf /tmp/gategoldjira
```

#### Method B: One-Line Curl (If Repo is Public or Using Token)
```bash
curl -fsSL https://github.com/HosamKsbaa/GateGoldJira/releases/download/v1.0.0-plugin/install.sh | bash
```

---

### 🪟 Windows (PowerShell)

Open **PowerShell** and run:

#### Method A: Using GitHub CLI (`gh`) (Works for Private & Public Repo)
```powershell
# 1. Create a temporary folder and download the release
New-Item -ItemType Directory -Force -Path "$env:TEMP\gategoldjira" | Out-Null
gh release download v1.0.0-plugin --repo HosamKsbaa/GateGoldJira --pattern "*.tar.gz" --dir "$env:TEMP\gategoldjira"

# 2. Ensure the Antigravity plugins folder exists
$pluginDir = "$env:USERPROFILE\.gemini\config\plugins"
New-Item -ItemType Directory -Force -Path $pluginDir | Out-Null

# 3. Extract the archive into the plugins directory
tar -xzf "$env:TEMP\gategoldjira\gategoldjira-plugin-v1.0.0.tar.gz" -C $pluginDir

# 4. Clean up temporary files
Remove-Item -Recurse -Force "$env:TEMP\gategoldjira"
```

#### Method B: Direct PowerShell Script (If Repo is Public)
```powershell
$url = "https://github.com/HosamKsbaa/GateGoldJira/releases/download/v1.0.0-plugin/gategoldjira-plugin-v1.0.0.tar.gz"
$pluginDir = "$env:USERPROFILE\.gemini\config\plugins"
New-Item -ItemType Directory -Force -Path $pluginDir | Out-Null
$dest = "$env:TEMP\gategoldjira.tar.gz"

Invoke-WebRequest -Uri $url -OutFile $dest
tar -xzf $dest -C $pluginDir
Remove-Item -Force $dest
```

---

## Getting Started After Installation

1. **Reload / Restart Antigravity** on your computer.
2. In the right/left side panel, click the **GateGoldJira** icon.
3. Set your server URL:
   * **Hosted Cloud Server:** `https://jira.34.62.68.230.sslip.io`
   * **Local Development Server:** `http://localhost:21080`
4. Click **Save server settings** and sign in with your credentials.
