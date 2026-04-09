# Spec: Archive & Emergency Kit Exports

Module: certificates
Area: Event Archive, Emergency Kit, Pre-Event Backup

## Checkpoints

### CP-126: Event archive includes certificate PDFs
- **Action**: Issue certs with storageKeys, generate event archive
- **Expected**: ZIP contains certificate PDF files
- **Pass criteria**: PDFs present in archive

### CP-127: Event archive handles missing cert PDFs gracefully
- **Action**: Generate archive where some cert PDFs fail to fetch from R2
- **Expected**: Archive created with available files, failed ones skipped
- **Pass criteria**: No crash, partial success

### CP-128: Event archive creates without certs when none exist
- **Action**: Generate archive for event with no issued certificates
- **Expected**: ZIP created with agenda only
- **Pass criteria**: No error, valid ZIP

### CP-129: Emergency kit includes certificate R2 keys
- **Action**: Issue certs, generate emergency kit
- **Expected**: JSON file listing all certificate storageKeys
- **Pass criteria**: Keys present for offline lookup

### CP-130: Pre-event backup cron finds events in 48h window
- **Action**: Create event starting in 24 hours
- **Expected**: findEventsNeedingBackup returns this event
- **Pass criteria**: Event included in backup candidates

### CP-131: Pre-event backup cron skips events outside 48h window
- **Action**: Create event starting in 72 hours
- **Expected**: findEventsNeedingBackup does NOT return this event
- **Pass criteria**: Event excluded from backup
