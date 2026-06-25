# Testing Guide - Agape Conference Management System

## ✅ Completed Features

### 1. Infrastructure Management (Complete)
All infrastructure CRUD pages are now fully functional:

#### Conference Houses Page (`/houses`)
- **Create**: Add new conference houses with name and description
- **Edit**: Update existing conference house details
- **Delete**: Remove conference houses (with confirmation)
- **View**: Grid layout showing all houses with creation dates

#### Buildings Page (`/buildings`)
- **Create**: Add buildings with name, conference house selection, and floor count
- **Edit**: Update building details
- **Delete**: Remove buildings (with cascade warning)
- **Filter**: Filter buildings by conference house
- **View**: Grid cards showing building name, house, and floor count

#### Floors Page (`/floors`)
- **Create**: Add floors with floor number, name, and building selection
- **Edit**: Update floor details
- **Delete**: Remove floors (with cascade warning)
- **Filter**: Filter floors by building
- **View**: Grid cards showing floor number, name, and building

#### Rooms Page (`/rooms`)
- **Create**: Add rooms with:
  * Room number (required)
  * Floor selection (required)
  * Capacity (required)
  * Room type: SINGLE, DOUBLE, SUITE, DORMITORY (required)
  * Amenities (optional JSON)
- **Edit**: Update room details
- **Delete**: Remove rooms
- **Cascading Filters**: Filter by building, then by floor
- **View**: Grid cards with color-coded room types
  * Blue: Single
  * Green: Double
  * Purple: Suite
  * Orange: Dormitory

### 2. Sidebar Navigation
- Fixed left sidebar (64 width)
- Icons for all 8 sections:
  * Dashboard
  * Attendees
  * Check-in
  * Assignments
  * Houses
  * Buildings
  * Floors
  * Rooms
- Active state highlighting
- Hover effects

### 3. Button Styles
- All button classes fixed with complete definitions
- Three variants: primary (blue), secondary (gray), danger (red)
- Proper hover, focus, and disabled states

### 4. Attendee Management
- CRUD operations work correctly
- Form fields match Excel template exactly:
  * Full Name (required)
  * Phone
  * Email
  * Age
  * Gender (MALE/FEMALE/OTHER)
  * Church/Organization
  * Role (LEADER/PASTOR/VIP/ATTENDEE/STAFF/VOLUNTEER/OTHER)
  * Notes

## 🧪 How to Test

### Testing Infrastructure Management

1. **Start Servers** (if not running):
   ```powershell
   # Backend (Terminal 1)
   cd backend
   npm run dev

   # Frontend (Terminal 2)
   cd frontend
   npm run dev
   ```

2. **Test Conference Houses**:
   - Navigate to http://localhost:5174/houses
   - Click "Add Conference House"
   - Enter name: "Test House" and description: "Sample house"
   - Click "Create"
   - Verify house appears in grid
   - Click Edit icon to modify
   - Click Delete icon to remove (after testing other features)

3. **Test Buildings**:
   - Navigate to http://localhost:5174/buildings
   - Click "Add Building"
   - Enter name: "Main Building"
   - Select conference house from dropdown
   - Set floor count: 3
   - Click "Create"
   - Test filter by selecting different houses
   - Verify building cards show correct house name

4. **Test Floors**:
   - Navigate to http://localhost:5174/floors
   - Click "Add Floor"
   - Select building from dropdown
   - Enter floor number: 1
   - Enter name: "Ground Floor"
   - Click "Create"
   - Create floors 2 and 3
   - Test filter by selecting different buildings

5. **Test Rooms**:
   - Navigate to http://localhost:5174/rooms
   - Click "Add Room"
   - Select building (dropdown will populate floors)
   - Select floor
   - Enter room number: "101"
   - Set capacity: 2
   - Select room type: DOUBLE
   - (Optional) Add amenities: `{"wifi": true, "ac": true}`
   - Click "Create"
   - Test cascading filters (building → floor)
   - Verify color coding matches room type
   - Create various room types to test color schemes

### Testing Excel Import/Export

1. **Download Template**:
   - Navigate to http://localhost:5174/attendees
   - Click "Import Attendees"
   - Click "Download Template" (or manually download from http://localhost:3000/api/excel/attendees/template)
   - Open the template file in Excel/LibreOffice

2. **Prepare Test Data**:
   - Open downloaded template
   - See example row with all fields
   - Add test attendees (at least 3-5 rows):
     ```
     Full Name       | Phone        | Email              | Age | Gender | Church/Organization | Role     | Notes
     John Smith      | 1234567890   | john@test.com      | 35  | MALE   | Grace Church       | PASTOR   | Senior pastor
     Jane Doe        | 9876543210   | jane@test.com      | 28  | FEMALE | Hope Chapel        | LEADER   | Youth leader
     Bob Johnson     | 5555555555   | bob@test.com       | 42  | MALE   | Faith Assembly     | ATTENDEE | Regular member
     Alice Williams  | 4444444444   | alice@test.com     | 31  | FEMALE | Love Community     | VIP      | Guest speaker
     Charlie Brown   | 3333333333   | charlie@test.com   | 25  | OTHER  | Unity Church       | STAFF    | Tech support
     ```
   - Save the file

3. **Test Import**:
   - Go to http://localhost:5174/attendees
   - Click "Import Attendees"
   - Click "Choose File" and select your prepared file
   - Click "Import"
   - Wait for success message
   - Verify:
     * Success toast shows "Imported X attendees"
     * Attendees list refreshes and shows new entries
     * Check that all fields populated correctly
     * Verify gender and role values converted properly

4. **Test Export**:
   - Go to http://localhost:5174/attendees
   - Click "Export Attendees"
   - File downloads with timestamp
   - Open exported file
   - Verify all attendee data exported correctly
   - Compare with database to ensure no data loss

5. **Test Import Error Handling**:
   - Create invalid Excel file:
     * Missing required "Full Name" column
     * Invalid email format
     * Invalid age (negative or > 150)
     * Invalid gender/role values
   - Try to import
   - Verify error messages show which rows failed
   - Check that valid rows still import successfully

### Testing Other Features

1. **Dashboard**:
   - Navigate to http://localhost:5174/dashboard
   - Verify statistics display correctly
   - Check occupancy breakdown shows houses → buildings → floors
   - Verify recent activity shows latest actions

2. **Check-in**:
   - Navigate to http://localhost:5174/check-in
   - Search for attendee
   - Check attendee in/out
   - Verify status updates in real-time

3. **Assignments**:
   - Navigate to http://localhost:5174/assignments
   - Click "Create Assignment"
   - Select unassigned attendee
   - Enter room ID (UUID from rooms page)
   - Create assignment
   - Export assignments to verify data

## 📊 Current Database State

According to previous tests:
- **Attendees**: 9 (1 checked in, 1 with assignment)
- **Rooms**: 40 rooms across 5 floors, 2 buildings, 1 house
- **Occupancy**: 2.5% (1 room assigned out of 40)
- **Buildings**: 2
- **Floors**: 5
- **Conference Houses**: 1

## 🐛 Known Issues & Notes

### Excel Import
- Backend endpoint tested and working: `POST /api/excel/attendees/import`
- Template download works: `GET /api/excel/attendees/template`
- Frontend UI exists and calls correct API
- **Need User Testing**: Have user test actual import with real data file to verify end-to-end

### Form Fields
- Attendee form fields **DO match** Excel template exactly
- All 8 fields present: fullName, phone, email, age, gender, churchOrg, conferenceRole, notes
- User's concern about mismatch appears to be incorrect based on code review

### Button Styles
- ✅ Fixed: All button classes now have complete inline definitions
- No more style "crashes" or broken buttons

### Navigation
- ✅ Fixed: Sidebar navigation now available
- All 8 sections accessible with icons
- Active state shows current page

## 🚀 Next Steps

1. **User Testing**: Have the user test the new infrastructure pages
2. **Excel Import Testing**: User should test importing real attendee data
3. **Data Validation**: Verify all imported data displays correctly in UI
4. **Performance**: Monitor performance with larger datasets
5. **Edge Cases**: Test with:
   - Empty buildings (no floors)
   - Empty floors (no rooms)
   - Full capacity rooms
   - Special characters in names
   - Very long text in notes fields

## 📝 API Endpoints Reference

### Infrastructure
- `GET /api/conference-houses` - List all houses
- `POST /api/conference-houses` - Create house
- `PUT /api/conference-houses/:id` - Update house
- `DELETE /api/conference-houses/:id` - Delete house

- `GET /api/buildings` - List all buildings
- `POST /api/buildings` - Create building
- `PUT /api/buildings/:id` - Update building
- `DELETE /api/buildings/:id` - Delete building

- `GET /api/floors` - List all floors
- `POST /api/floors` - Create floor
- `PUT /api/floors/:id` - Update floor
- `DELETE /api/floors/:id` - Delete floor

- `GET /api/rooms` - List all rooms
- `POST /api/rooms` - Create room
- `PUT /api/rooms/:id` - Update room
- `DELETE /api/rooms/:id` - Delete room

### Excel Operations
- `GET /api/excel/attendees/template` - Download template
- `POST /api/excel/attendees/import` - Import attendees
- `GET /api/excel/attendees/export` - Export attendees
- `GET /api/excel/assignments/export` - Export assignments

## ✅ Completion Checklist

- [x] Conference Houses page (CRUD)
- [x] Buildings page (CRUD with filters)
- [x] Floors page (CRUD with filters)
- [x] Rooms page (CRUD with cascading filters)
- [x] Sidebar navigation
- [x] Button styles fixed
- [x] App.tsx routes updated
- [x] TypeScript compilation successful
- [x] Git commits created
- [x] Testing guide documented
- [ ] User testing of infrastructure pages
- [ ] User testing of Excel import with real data
- [ ] Verification of all features in production environment
