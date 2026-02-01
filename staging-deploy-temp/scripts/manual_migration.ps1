# PowerShell script to manually execute follow-up reminder migration
# This bypasses Node.js database connection issues

Write-Host "Starting manual follow-up reminder migration..." -ForegroundColor Green

# Database connection parameters
$DB_USER = "postgres"
$DB_PASSWORD = "HelpMe11"
$DB_NAME = "ixasales"
$DB_HOST = "localhost"
$DB_PORT = "5432"

# Test database connection
Write-Host "Testing database connection..." -ForegroundColor Yellow
try {
    $connectionString = "postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
    
    # Simple connection test using psql if available
    $testQuery = "SELECT 1 as test;"
    
    # Try to execute test query
    $result = & psql -U $DB_USER -d $DB_NAME -c $testQuery 2>$null
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Database connection successful!" -ForegroundColor Green
    } else {
        Write-Host "Database connection failed. Trying alternative approach..." -ForegroundColor Red
        
        # Alternative: Try with different authentication method
        Write-Host "Attempting to connect with trust authentication..." -ForegroundColor Yellow
        $env:PGPASSWORD = $DB_PASSWORD
        $result = & psql -U $DB_USER -d $DB_NAME -h $DB_HOST -p $DB_PORT -c $testQuery 2>$null
        
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Failed to connect to database. Please check:" -ForegroundColor Red
            Write-Host "  1. PostgreSQL service is running" -ForegroundColor Red
            Write-Host "  2. Database credentials are correct" -ForegroundColor Red
            Write-Host "  3. Database 'ixasales' exists" -ForegroundColor Red
            exit 1
        }
    }
} catch {
    Write-Host "Error testing database connection: $_" -ForegroundColor Red
    exit 1
}

# Check if column already exists
Write-Host "Checking if follow_up_reminder_sent_at column exists..." -ForegroundColor Yellow
$checkColumnQuery = @"
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'sales_visits' 
AND column_name = 'follow_up_reminder_sent_at';
"@

$columnExists = & psql -U $DB_USER -d $DB_NAME -h $DB_HOST -p $DB_PORT -t -A -c $checkColumnQuery 2>$null

if ($columnExists -and $columnExists.Trim() -eq "follow_up_reminder_sent_at") {
    Write-Host "Column already exists. Skipping creation." -ForegroundColor Green
} else {
    Write-Host "Creating follow_up_reminder_sent_at column..." -ForegroundColor Yellow
    
    # Add the column
    $addColumnQuery = @"
ALTER TABLE sales_visits 
ADD COLUMN IF NOT EXISTS follow_up_reminder_sent_at TIMESTAMP WITH TIME ZONE;
"@
    
    $addResult = & psql -U $DB_USER -d $DB_NAME -h $DB_HOST -p $DB_PORT -c $addColumnQuery 2>$null
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Successfully added follow_up_reminder_sent_at column" -ForegroundColor Green
    } else {
        Write-Host "Failed to add column: $addResult" -ForegroundColor Red
        exit 1
    }
}

# Create index for performance
Write-Host "Creating index for follow-up reminders..." -ForegroundColor Yellow
$createIndexQuery = @"
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_visits_follow_up_pending
ON sales_visits (outcome, follow_up_date, follow_up_reminder_sent_at)
WHERE outcome = 'follow_up' 
AND follow_up_reminder_sent_at IS NULL;
"@

$indexResult = & psql -U $DB_USER -d $DB_NAME -h $DB_HOST -p $DB_PORT -c $createIndexQuery 2>$null

if ($LASTEXITCODE -eq 0) {
    Write-Host "Successfully created index for follow-up reminders" -ForegroundColor Green
} else {
    Write-Host "Warning: Failed to create index: $indexResult" -ForegroundColor Yellow
    Write-Host "Continuing without index..." -ForegroundColor Yellow
}

# Add column comment for documentation
Write-Host "Adding column documentation..." -ForegroundColor Yellow
$addCommentQuery = @"
COMMENT ON COLUMN sales_visits.follow_up_reminder_sent_at 
IS 'Timestamp when follow-up reminder was sent to sales representative';
"@

$commentResult = & psql -U $DB_USER -d $DB_NAME -h $DB_HOST -p $DB_PORT -c $addCommentQuery 2>$null

if ($LASTEXITCODE -eq 0) {
    Write-Host "Successfully added column documentation" -ForegroundColor Green
} else {
    Write-Host "Warning: Failed to add documentation: $commentResult" -ForegroundColor Yellow
}

# Validate the migration
Write-Host "Validating migration..." -ForegroundColor Yellow
$validateQuery = @"
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'sales_visits' 
AND column_name = 'follow_up_reminder_sent_at';
"@

$validationResult = & psql -U $DB_USER -d $DB_NAME -h $DB_HOST -p $DB_PORT -c $validateQuery 2>$null

if ($LASTEXITCODE -eq 0) {
    Write-Host "Migration validation successful:" -ForegroundColor Green
    Write-Host $validationResult
    Write-Host "Follow-up reminder migration completed successfully!" -ForegroundColor Green
} else {
    Write-Host "Migration validation failed: $validationResult" -ForegroundColor Red
    exit 1
}

# Test insert capability
Write-Host "Testing insert capability..." -ForegroundColor Yellow
$testInsertQuery = @"
INSERT INTO sales_visits (
    id, tenant_id, customer_id, sales_rep_id, 
    outcome, follow_up_date, follow_up_reminder_sent_at
) VALUES (
    gen_random_uuid(),
    (SELECT id FROM tenants LIMIT 1),
    (SELECT id FROM customers LIMIT 1),
    (SELECT id FROM users LIMIT 1),
    'follow_up',
    CURRENT_DATE,
    NOW()
)
ON CONFLICT DO NOTHING
RETURNING id;
"@

$testResult = & psql -U $DB_USER -d $DB_NAME -h $DB_HOST -p $DB_PORT -c $testInsertQuery 2>$null

if ($LASTEXITCODE -eq 0) {
    Write-Host "Insert test successful" -ForegroundColor Green
    
    # Clean up test data
    $cleanupQuery = @"
DELETE FROM sales_visits 
WHERE follow_up_reminder_sent_at IS NOT NULL 
AND outcome = 'follow_up'
AND created_at > NOW() - INTERVAL '1 minute';
"@
    
    & psql -U $DB_USER -d $DB_NAME -h $DB_HOST -p $DB_PORT -c $cleanupQuery 2>$null > $null
    Write-Host "Test data cleaned up" -ForegroundColor Green
} else {
    Write-Host "Warning: Insert test failed: $testResult" -ForegroundColor Yellow
}

Write-Host "Manual migration completed!" -ForegroundColor Green
Write-Host "You can now restart your application server to use the follow-up reminders feature." -ForegroundColor Cyan