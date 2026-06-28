# Excel Import/Export Guide

## Overview

The Agape Conference Management System supports bulk import and export of attendee data using Excel files. The system matches the structure of your conference registration Excel file (`موتمر time out.xlsx`).

## Excel Column Structure

The system supports the following columns for import/export:

### Basic Information
- **Ticket ID**: Conference ticket identifier (e.g., `TO-20260607-578181`)
- **Email**: Attendee email address
- **Full Name**: Attendee's full name (required, supports Arabic)
- **Gender**: `MALE`, `FEMALE`, `OTHER` (also supports Arabic: `ذكر`, `أنثى`)
- **Phone**: Phone number (accepts numeric format from Excel)
- **Age**: Age in years (1-150)

### Church & Location
- **Church**: Church or organization name
- **Area**: Neighborhood or area name
- **Governorate**: Province or governorate (e.g., `القاهرة`)

### Travel & Transportation
- **Arrival Method**: Transportation method (e.g., `باص المؤتمر`, `ملاكي`)
- **Bus Pickup Point**: Bus pickup location if applicable

### Payment Information
- **Payment Method**: Payment method used (e.g., `InstaPay`, `Orange Cash`)
- **Payment Review Status**: `PENDING`, `CONFIRMED`, or `REJECTED`
- **Transaction Number**: Payment transaction reference

### Conference Management
- **Role**: Conference role - `ATTENDEE`, `LEADER`, `PASTOR`, `VIP`, `STAFF`, `VOLUNTEER`, `OTHER`
- **Notes**: General notes about the attendee
- **Rooming Notes**: Room assignment preferences
- **Internal Notes**: Admin-only notes

### Check-in Information (Export Only)
- **Checked In**: `YES` or `NO`
- **Check-in Time**: Timestamp of check-in
- **Checked-in By**: Staff member who performed check-in

### Room Assignment (Export Only)
- **Room Number**: Assigned room number
- **Building**: Building name
- **Floor**: Floor number

## How to Import Attendees

### Option 1: Using the Web Interface

1. Navigate to the **Attendees** page
2. Click the **Import** button in the toolbar
3. Choose your Excel file (`.xlsx` format)
4. Click **Upload**
5. Review the import results:
   - **Imported**: Number of successfully imported attendees
   - **Failed**: Number of failed records with error details

### Option 2: Using the API

```bash
curl -X POST http://localhost:3000/api/excel/attendees/import \
  -F "file=@your-attendees.xlsx" \
  -H "Content-Type: multipart/form-data"
```

### Import Validation Rules

- **Full Name** is required
- **Email** must be valid format if provided
- **Age** must be between 1 and 150 if provided
- **Gender** accepts: MALE, FEMALE, OTHER, ذكر, أنثى
- **Payment Status** accepts: PENDING, CONFIRMED, REJECTED
- **Role** accepts: ATTENDEE, LEADER, PASTOR, VIP, STAFF, VOLUNTEER, OTHER

### Import Behavior

- Duplicate ticket IDs will fail (ticket ID must be unique)
- Empty cells are treated as `null` or `undefined`
- Phone numbers stored as numbers in Excel are automatically converted to strings
- Arabic text is fully supported for all fields
- Failed records do not prevent successful records from being imported

## How to Export Attendees

### Option 1: Using the Web Interface

1. Navigate to the **Attendees** page
2. Apply any filters you want (role, gender, search, etc.)
3. Click the **Export** button
4. The Excel file will download automatically with filename: `attendees-YYYY-MM-DD.xlsx`

### Option 2: Using the API

```bash
# Export all attendees
curl -X GET http://localhost:3000/api/excel/attendees/export \
  -o attendees.xlsx

# Export with filters
curl -X GET "http://localhost:3000/api/excel/attendees/export?role=ATTENDEE&gender=MALE" \
  -o male-attendees.xlsx
```

### Export Filters

- `search`: Search by name
- `role`: Filter by conference role
- `gender`: Filter by gender
- `checkedIn`: Filter by check-in status (true/false)
- `hasAssignment`: Filter by room assignment status (true/false)

### Export Limits

- Maximum 10,000 attendees per export
- For larger exports, use API pagination or contact system administrator

## Excel Template

### Download Template

1. **Web Interface**: Click **Download Template** on the Attendees page
2. **Direct Link**: http://localhost:3000/api/excel/attendees/template
3. **Command Line**:
   ```bash
   curl -X GET http://localhost:3000/api/excel/attendees/template \
     -o attendee-template.xlsx
   ```

### Template Structure

The template includes:
- Column headers matching the import structure
- 2 sample rows with example data
- Proper column widths for easy data entry
- Comments and descriptions (future enhancement)

## Testing Import with Your Data

### Test with Sample Data

A test file `test-import-sample.xlsx` has been created with 3 sample attendees from your conference registration data:

```bash
# Test import via API
curl -X POST http://localhost:3000/api/excel/attendees/import \
  -F "file=@test-import-sample.xlsx"
```

### Import Full Registration Data

To import all 997 attendees from `موتمر time out.xlsx`:

1. **Backup your database first**:
   ```bash
   cd backend
   npx prisma db push --preview-feature
   pg_dump agape_conference > backup.sql
   ```

2. **Use the "Registrations" sheet** (the active sheet with current data)

3. **Import via web interface or API**

4. **Review import results** for any validation errors

## Troubleshooting

### Common Import Errors

**"Full name is required"**
- Ensure every row has a value in the "Full Name" column

**"Invalid email format"**
- Check that email addresses are properly formatted
- Empty emails are allowed

**"Age must be between 1 and 150"**
- Verify age values are realistic
- Age is optional

**"Duplicate ticket ID"**
- Ticket IDs must be unique across all attendees
- Consider removing or modifying duplicate ticket IDs

### Excel Format Issues

**File format not supported**
- Ensure file is `.xlsx` format (not `.xls` or `.csv`)
- Use Excel 2007+ or compatible software

**Arabic text not displaying**
- System fully supports UTF-8 and Arabic characters
- Ensure Excel file is saved with UTF-8 encoding

**Numbers showing as dates**
- Excel sometimes auto-formats numbers as dates
- Format cells as "Text" before entering data

## API Reference

### POST /api/excel/attendees/import

Import attendees from Excel file.

**Request:**
- Content-Type: `multipart/form-data`
- Body: Excel file upload

**Response:**
```json
{
  "success": true,
  "data": {
    "imported": 997,
    "failed": 0,
    "attendees": [...],
    "errors": []
  },
  "message": "Imported 997 attendees, 0 failed"
}
```

### GET /api/excel/attendees/export

Export attendees to Excel file.

**Query Parameters:**
- `search` (optional): Search by name
- `role` (optional): Filter by role
- `gender` (optional): Filter by gender
- `checkedIn` (optional): Filter by check-in status
- `hasAssignment` (optional): Filter by room assignment

**Response:**
- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Binary Excel file

### GET /api/excel/attendees/template

Download blank attendee import template.

**Response:**
- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Binary Excel file with sample data

## Database Schema

The attendee database schema includes:

```typescript
interface Attendee {
  id: string;
  ticketId?: string;              // Unique conference ticket
  fullName: string;                // Required
  phone?: string;
  email?: string;
  age?: number;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  church?: string;
  area?: string;
  governorate?: string;
  arrivalMethod?: string;
  busPickupPoint?: string;
  paymentMethod?: string;
  paymentStatus?: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  transactionNumber?: string;
  conferenceRole: 'ATTENDEE' | 'LEADER' | 'PASTOR' | 'VIP' | 'STAFF' | 'VOLUNTEER' | 'OTHER';
  notes?: string;
  roomingNotes?: string;
  internalNotes?: string;
  checkedInAt?: Date;
  checkedInBy?: string;
  checkedOutAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
```

## Best Practices

### Before Import
1. **Back up your database**
2. **Validate your Excel file** (check for required fields, formats)
3. **Test with a small sample** first (3-10 records)
4. **Review template** to ensure column names match exactly

### During Import
1. **Monitor import progress** through the UI or API response
2. **Review error messages** for any failed records
3. **Note the number of imported vs. failed records**

### After Import
1. **Verify data** by searching for a few sample attendees
2. **Check statistics** on the dashboard
3. **Export to Excel** to confirm data integrity
4. **Review any failed imports** and correct source data

### Data Management
1. **Keep original Excel files** as backup
2. **Use consistent naming** for exported files
3. **Regular exports** for backup purposes
4. **Clean data** before large imports (remove duplicates, validate formats)

## Support

For issues or questions:
1. Check this guide first
2. Review error messages carefully
3. Test with the provided sample files
4. Check backend logs: `backend/logs/`
5. Verify database schema: `npx prisma studio`

## Version History

- **v1.0** (2026-06-28): Initial release with conference registration format support
- Supports all fields from `موتمر time out.xlsx`
- Arabic language support
- Comprehensive validation
- Batch import with error reporting
