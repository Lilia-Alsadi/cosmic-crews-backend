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
  **Request:**
  ```json
  {
    "email": "test@gmail.com",
    "username": "stargazer99",
    "full_name": "John Doe",
    "password": "password123"
  }
  ```
  **Response:**
  ```json
  {
    "message": "User registered successfully",
    "token": "eyJhbGciOiJIUzI1NiIsIn...",
    "user": {
      "id": 1,
      "email": "test@gmail.com",
      "username": "stargazer99",
      "full_name": "John Doe",
      "role": "USER"
    }
  }
  ```

- POST /auth/login: Authenticate and receive a JWT.
  **Request:**
  ```json
  {
    "login": "test@gmail.com",
    "password": "password123"
  }
  ```
  **Response:**
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsIn...",
    "user": {
      "id": 1,
      "email": "test@gmail.com",
      "username": "stargazer99",
      "role": "USER",
      "status": "ACTIVE"
    }
  }
  ```

**Users (/api/users)**
- GET /users/me (Protected):Get the currently authenticated user's profile.
  **Response:**
  ```json
  {
    "id": 1,
    "username": "stargazer99",
    "bio": "I love space",
    "location": "Earth",
    "avatar_url": "http://...",
    "banner_url": "http://..."
  }
  ```

- PUT /users/me (Protected):Update the currently authenticated user's profile.
  **Request:**
  ```json
  {
    "full_name": "John Smith",
    "bio": "Updated bio",
    "location": "Mars",
    "avatar_url": "http://image.jpg"
  }
  ```
  **Response:**
  ```json
  {
    "message": "Profile updated successfully",
    "user": {
      "id": 1,
      "full_name": "John Smith"
    }
  }
  ```

**Observations / Logs (/api/logs)**
- GET /logs :Fetch global observation logs (supports filtering and search).
  **Response:**
  ```json
  [
    {
      "id": 1,
      "title": "Andromeda Galaxy",
      "target_object": "M31",
      "likes_count": 5,
      "comments_count": 2,
      "author_username": "stargazer99"
    }
  ]
  ```

- GET /logs/:id :Fetch a specific observation log.
  **Response:**
  ```json
  {
    "id": 1,
    "title": "Andromeda Galaxy",
    "content": "First clear night in weeks!"
  }
  ```

- POST /logs (Protected):Create a new observation log.
  **Request:**
  ```json
  {
    "title": "The Moon",
    "target_object": "Luna",
    "bortle_class": 3,
    "image_url": "http://..."
  }
  ```
  **Response:**
  ```json
  {
    "message": "Observation log created successfully"
  }
  ```

- POST /logs/:id/like (Protected):Toggle like on an observation.
  **Response:**
  ```json
  {
    "message": "Like toggled",
    "liked": true
  }
  ```

- POST /logs/:id/flag:Flag an observation for moderation.
  **Response:**
  ```json
  {
    "message": "Observation flagged for review"
  }
  ```

- GET /logs/:id/comments: Fetch comments for an observation.
  **Response:**
  ```json
  [
    {
      "id": 1,
      "content": "Amazing capture!",
      "author_username": "stargazer99"
    }
  ]
  ```

- POST /logs/:id/comments (Protected) :Add a comment to an observation.
  **Request:**
  ```json
  {
    "content": "Great photo!"
  }
  ```
  **Response:**
  ```json
  {
    "message": "Comment added successfully"
  }
  ```

- POST /logs/comments/:id/flag :Flag a specific comment for moderation.
  **Response:**
  ```json
  {
    "message": "Comment flagged"
  }
  ```

**Crews (/api/crews)**
- GET /crews (Protected) :List all cosmic crews.
  **Response:**
  ```json
  [
    {
      "id": 1,
      "name": "Lunar Observers",
      "member_count": 10
    }
  ]
  ```

- POST /crews (Protected) :Create a new cosmic crew.
  **Request:**
  ```json
  {
    "name": "Lunar Observers",
    "description": "We love the moon.",
    "location": "Global"
  }
  ```
  **Response:**
  ```json
  {
    "message": "Crew created successfully",
    "crew": {
      "id": 1,
      "name": "Lunar Observers"
    }
  }
  ```

- GET /crews/:id (Protected) :Get specific crew details.
  **Response:**
  ```json
  {
    "id": 1,
    "name": "Lunar Observers",
    "member_count": 10,
    "log_count": 5,
    "current_user_role": "owner"
  }
  ```

- PUT /crews/:id (Protected) :Update a crew (Owner/Admin only).
  **Request:**
  ```json
  {
    "name": "Updated Crew Name"
  }
  ```
  **Response:**
  ```json
  {
    "message": "Crew updated successfully"
  }
  ```

- DELETE /crews/:id (Protected) :Delete a crew (Owner/Admin only).
  **Response:**
  ```json
  {
    "message": "Crew deleted successfully"
  }
  ```

- GET /crews/:id/members (Protected): List members of a crew.
  **Response:**
  ```json
  [
    {
      "user_id": 1,
      "username": "stargazer99",
      "role": "member"
    }
  ]
  ```

- POST /crews/:id/members (Protected) :Join a crew or add a member.
  **Response:**
  ```json
  {
    "message": "Joined crew successfully"
  }
  ```

- PUT /crews/:id/members/:userId (Protected) :Update a member's role.
  **Request:**
  ```json
  {
    "role": "admin"
  }
  ```
  **Response:**
  ```json
  {
    "message": "Member role updated"
  }
  ```

- DELETE /crews/:id/members/:userId (Protected) : Remove a member or leave a crew.
  **Response:**
  ```json
  {
    "message": "Member removed"
  }
  ```

- GET /crews/:id/logs (Protected): Get observation logs made by members of this crew.
  **Response:**
  ```json
  [
    {
      "id": 1,
      "title": "Log by member"
    }
  ]
  ```

- GET /crews/:id/events (Protected): Get events scheduled for this crew.
  **Response:**
  ```json
  [
    {
      "id": 1,
      "title": "Star Party",
      "start_time": "2026-06-20T20:00:00Z"
    }
  ]
  ```

- POST /crews/:id/events (Protected) : Create a new event for this crew.
  **Request:**
  ```json
  {
    "title": "Weekend Meetup",
    "start_time": "2026-06-20T20:00:00Z"
  }
  ```
  **Response:**
  ```json
  {
    "message": "Event created successfully"
  }
  ```

**Events (/api/events)**
- POST /events/:eventId/rsvp (Protected) : RSVP (going/interested) to an event.
  **Request:**
  ```json
  {
    "status": "going"
  }
  ```
  **Response:**
  ```json
  {
    "message": "RSVP updated"
  }
  ```

- PUT /events/:eventId (Protected) : Update an event's details.
  **Request:**
  ```json
  {
    "title": "Updated Meetup"
  }
  ```
  **Response:**
  ```json
  {
    "message": "Event updated successfully"
  }
  ```

- DELETE /events/:eventId (Protected) : Cancel/delete an event.
  **Response:**
  ```json
  {
    "message": "Event deleted"
  }
  ```

- GET /events/:eventId/rsvps (Protected): Get all RSVPs for a specific event.
  **Response:**
  ```json
  [
    {
      "user_id": 1,
      "status": "going"
    }
  ]
  ```

**Platform Administration (/api/admin)**
(All admin routes require ADMIN  role)
- GET /admin/stats : Get platform-wide telemetry stats.
  **Response:**
  ```json
  {
    "total_users": 10,
    "total_crews": 5,
    "total_logs": 20
  }
  ```

- GET /admin/users : List all users on the platform.
  **Response:**
  ```json
  [
    {
      "id": 1,
      "username": "stargazer99",
      "status": "ACTIVE"
    }
  ]
  ```

- PUT /admin/users/:id/status : Suspend/ban or unban a user.
  **Request:**
  ```json
  {
    "status": "BANNED"
  }
  ```
  **Response:**
  ```json
  {
    "message": "User status updated"
  }
  ```

- DELETE /admin/users/:id : Permanently nuke a user and all their data.
  **Response:**
  ```json
  {
    "message": "User deleted successfully"
  }
  ```

- GET /admin/crews : List all crews for moderation.
  **Response:**
  ```json
  [
    {
      "id": 1,
      "name": "Lunar Observers"
    }
  ]
  ```

- PUT /admin/crews/:id : Force-update a crew's details or ownership.
  **Request:**
  ```json
  {
    "name": "Moderated Crew Name"
  }
  ```
  **Response:**
  ```json
  {
    "message": "Crew updated successfully"
  }
  ```

- DELETE /admin/crews/:id : Force-delete a crew.
  **Response:**
  ```json
  {
    "message": "Crew deleted successfully"
  }
  ```

- GET /admin/crews/:id/events : Get events for a specific crew as an admin.
  **Response:**
  ```json
  [
    {
      "id": 1,
      "title": "Star Party Event"
    }
  ]
  ```

- PUT /admin/events/:eventId : Force-update an event.
  **Request:**
  ```json
  {
    "title": "Moderated Event Title"
  }
  ```
  **Response:**
  ```json
  {
    "message": "Event updated successfully"
  }
  ```

- DELETE /admin/events/:eventId : Force-cancel an event.
  **Response:**
  ```json
  {
    "message": "Event deleted successfully"
  }
  ```

- GET /admin/flagged-items : View the moderation queue (flagged logs & comments).
  **Response:**
  ```json
  {
    "flaggedLogs": [
      {
        "id": 1,
        "title": "Inappropriate Post",
        "flag_count": 3
      }
    ],
    "flaggedComments": []
  }
  ```

- DELETE /admin/logs/:id : Delete an observation log.
  **Response:**
  ```json
  {
    "message": "Log deleted successfully"
  }
  ```

- PUT /admin/logs/:id/dismiss : Dismiss flags on a log.
  **Response:**
  ```json
  {
    "message": "Flags dismissed"
  }
  ```

- DELETE /admin/comments/:id : Delete a comment.
  **Response:**
  ```json
  {
    "message": "Comment deleted successfully"
  }
  ```

- PUT /admin/comments/:id/dismiss : Dismiss flags on a comment.
  **Response:**
  ```json
  {
    "message": "Comment flags dismissed"
  }
  ```

**Utilities**
- POST /api/upload (Protected) : Upload a single multipart/form-data image to the server disk. Returns the { image_url }`.
  **Response:**
  ```json
  {
    "image_url": "http://localhost:5000/uploads/170000000.jpg"
  }
  ```