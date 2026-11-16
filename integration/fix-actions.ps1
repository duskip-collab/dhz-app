$filePath = "c:/Users/Admin/Documents/Projekt APP/DHZ APK/dhz-app-obnova/src/app/(app)/announcements/actions.ts"

# Read the file
$lines = Get-Content $filePath

# Remove the problematic import line (line 16)
$lines = $lines | Where-Object { $_ -notmatch "getAuthorizedAnnouncementIds" }

# Replace the wrong push notification call
$lines = $lines | ForEach-Object {
    if ($_ -match "sendPushNotificationToAll\(distributeAnnouncementToMembers\)") {
        "    await sendPushNotificationToAll(draft.id);"
    } elseif ($_ -match "distributeAnnouncementToMembers") {
        # Skip the empty distribute function lines
        ""
    } else {
        $_
    }
}

# Filter out the export statement for distributed function
$lines = $lines | Where-Object { $_ -notmatch "export.*distributeAnnouncementToMembers" }

# Write back
$lines | Set-Content $filePath

Write-Host "actions.ts updated successfully"
