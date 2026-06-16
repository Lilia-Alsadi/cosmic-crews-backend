# Cosmic Crews - Backend

This is an Express-based REST API built on top of PostgreSQL. It handles authentication, data management, image uploads, and platform administration for an app called **Cosmic Crews**. 

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL 
- **Authentication**: JWT and bcryptjs
- **File Uploads**: Multer (Local Storage)
- **Environment**: dotenv

## Local Setup & Execution

1. Install Dependencies: npm install

2. Environment Configuration : Create a .env file in the root backend directory and add in it :
- Database connection string
- Port

3. Start the Server : node server.js
The API will run at http://localhost:5000.

---

## How File Uploads Work
When users attach images to their stargazing logs, the backend handles it via Multer:
1. Files are sent via multipart/form-data to POST /api/upload.
2. Multer saves the physical file to the local uploads/ directory on the server disk.
3. Express serves these images statically via app.use("/uploads", express.static(uploadDir)).

---

## API Endpoints Reference

All endpoints are prefixed with /api. Protected endpoints require a valid JWT passed in the Authorization: Bearer <token> header.

**Authentication (/api/auth)**
- POST /auth/register:  Register a new user account.
- POST /auth/login: Authenticate and receive a JWT.

**Users (/api/users)**
- GET /users/me (Protected):Get the currently authenticated user's profile.
- PUT /users/me (Protected):Update the currently authenticated user's profile.

**Observations / Logs (/api/logs)**
- GET /logs :Fetch global observation logs (supports filtering and search).
- GET /logs/:id :Fetch a specific observation log.
- POST /logs (Protected):Create a new observation log.
- POST /logs/:id/like (Protected):Toggle like on an observation.
- POST /logs/:id/flag:Flag an observation for moderation.
- GET /logs/:id/comments: Fetch comments for an observation.
- POST /logs/:id/comments (Protected) :Add a comment to an observation.
- POST /logs/comments/:id/flag :Flag a specific comment for moderation.

**Crews (/api/crews)**
- GET /crews (Protected) :List all cosmic crews.
- POST /crews (Protected) :Create a new cosmic crew.
- GET /crews/:id (Protected) :Get specific crew details.
- PUT /crews/:id (Protected) :Update a crew (Owner/Admin only).
- DELETE /crews/:id (Protected) :Delete a crew (Owner/Admin only).
- GET /crews/:id/members (Protected): List members of a crew.
- POST /crews/:id/members (Protected) :Join a crew or add a member.
- PUT /crews/:id/members/:userId (Protected) :Update a member's role.
- DELETE /crews/:id/members/:userId (Protected) : Remove a member or leave a crew.
- GET /crews/:id/logs (Protected): Get observation logs made by members of this crew.
- GET /crews/:id/events (Protected): Get events scheduled for this crew.
- POST /crews/:id/events (Protected) : Create a new event for this crew.

**Events (/api/events)**
- POST /events/:eventId/rsvp (Protected) : RSVP (going/interested) to an event.
- PUT /events/:eventId (Protected) : Update an event's details.
- DELETE /events/:eventId (Protected) : Cancel/delete an event.
- GET /events/:eventId/rsvps (Protected): Get all RSVPs for a specific event.

**Platform Administration (/api/admin)**
(All admin routes require ADMIN  role)
- GET /admin/stats : Get platform-wide telemetry stats.
- GET /admin/users : List all users on the platform.
- PUT /admin/users/:id/status : Suspend/ban or unban a user.
- DELETE /admin/users/:id : Permanently nuke a user and all their data.
- GET /admin/crews : List all crews for moderation.
- PUT /admin/crews/:id : Force-update a crew's details or ownership.
- DELETE /admin/crews/:id : Force-delete a crew.
- GET /admin/crews/:id/events : Get events for a specific crew as an admin.
- PUT /admin/events/:eventId : Force-update an event.
- DELETE /admin/events/:eventId : Force-cancel an event.
- GET /admin/flagged-items : View the moderation queue (flagged logs & comments).
- DELETE /admin/logs/:id : Delete an observation log.
- PUT /admin/logs/:id/dismiss : Dismiss flags on a log.
- DELETE /admin/comments/:id : Delete a comment.
- PUT /admin/comments/:id/dismiss : Dismiss flags on a comment.

**Utilities**
- POST /api/upload (Protected) : Upload a single multipart/form-data image to the server disk. Returns the { image_url }`.