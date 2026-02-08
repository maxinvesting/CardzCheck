# Backup & Recovery

This document describes the backup and recovery procedures for CardzCheck.

## Database (Supabase)

### Automatic Backups

Supabase provides automatic daily backups on Pro plan and above:

| Plan | Backup Frequency | Retention |
|------|------------------|-----------|
| Free | None | N/A |
| Pro | Daily | 7 days |
| Team | Daily | 14 days |
| Enterprise | Daily + custom | Custom |

**Note:** If on Free plan, manual exports are required for data safety.

### Point-in-Time Recovery (PITR)

Available on Pro plan ($25/month add-on) and included in Team/Enterprise:

- Restore to any point within the retention window
- Access via Supabase Dashboard → Settings → Database → Backups
- Useful for recovering from accidental deletions or bad migrations

### Manual Database Export

For manual backups or migration:

```bash
# Export full database (requires pg_dump)
pg_dump -h db.<project-ref>.supabase.co \
  -U postgres \
  -d postgres \
  --no-owner \
  --no-acl \
  -f backup_$(date +%Y%m%d).sql

# Password is in Supabase Dashboard → Settings → Database → Connection string
```

### Restoring from Backup

#### Via Supabase Dashboard (PITR)
1. Go to Dashboard → Settings → Database → Backups
2. Select the restore point
3. Click "Restore" (creates a new project with restored data)
4. Update environment variables to point to new project

#### Via SQL Dump
```bash
psql -h db.<project-ref>.supabase.co \
  -U postgres \
  -d postgres \
  -f backup_20250131.sql
```

## Storage (Card Images)

### Supabase Storage Backups

Storage objects are **not** included in database backups. For critical image data:

1. **S3 Sync** (if using external S3):
   ```bash
   aws s3 sync s3://your-bucket ./backup/images/
   ```

2. **Manual Export** via Supabase API:
   ```javascript
   // List all files in bucket
   const { data } = await supabase.storage.from('card-images').list();
   // Download each file
   ```

### Recovery

Re-upload images to the `card-images` bucket maintaining the same path structure:
```
{user_id}/{filename}
```

## User Data Export (GDPR/CCPA)

Users can request their data. Export includes:

1. **Collection items**: `SELECT * FROM collection_items WHERE user_id = ?`
2. **Watchlist**: `SELECT * FROM watchlist WHERE user_id = ?`
3. **Analyst threads**: `SELECT * FROM analyst_threads WHERE user_id = ?`
4. **Card images**: Files in `card-images/{user_id}/*`

## Disaster Recovery Checklist

In case of data loss:

1. [ ] Identify scope of data loss (which tables, time range)
2. [ ] Check Supabase backup availability (Dashboard → Backups)
3. [ ] If PITR available, restore to point before incident
4. [ ] If no PITR, restore from latest daily backup
5. [ ] Notify affected users if data loss exceeds backup window
6. [ ] Update incident log in `docs/incidents/`

## Testing Backups

**Monthly:** Verify backup integrity by restoring to a test project:

1. Create new Supabase project (or use staging)
2. Restore latest backup
3. Verify row counts match production
4. Verify a sample of user data is intact
5. Delete test project

## Monitoring

Set up alerts for:

- [ ] Supabase project approaching storage limits
- [ ] Failed backup notifications (if available via Supabase)
- [ ] Database connection errors (via Sentry)

## References

- [Supabase Backups Documentation](https://supabase.com/docs/guides/platform/backups)
- [Supabase PITR](https://supabase.com/docs/guides/platform/backups#point-in-time-recovery)
- [pg_dump Documentation](https://www.postgresql.org/docs/current/app-pgdump.html)
