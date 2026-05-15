# 💻 SPARSHA OMS - Frontend Development Guide

The SPARSHA Frontend is a Single Page Application (SPA) designed to be fast, responsive, and easy to maintain.

---

## 🛠️ Tech Stack & Ecosystem

- **Framework:** React 19
- **Build Tool:** Vite (replaces Webpack/CRA for faster builds)
- **Styling:** Tailwind CSS v4 (Utility-first framework)
- **Routing:** React Router v7
- **State Management:** Zustand (for global Auth/User state)
- **Data Fetching:** React Query & Axios

---

## 📁 Directory Structure

The `/frontend/src` directory is organized as follows:

- `assets/`: Static files like logos and icons.
- `components/`: 
  - `ui/`: Reusable, dumb components (Buttons, Inputs, Cards, Tables) styled with Tailwind.
  - `layout/`: Structural components like the Sidebar, Navbar, and standard Page Wrappers.
  - `forms/`: Reusable React Hook Form wrappers.
- `hooks/`: Custom React hooks (e.g., `usePermission.ts` for frontend RBAC checks).
- `pages/`: The actual route views (e.g., `Dashboard.tsx`, `StudentList.tsx`).
- `services/`: API abstraction layer. All Axios calls are defined here.
- `store/`: Zustand state definitions (e.g., `useAuthStore.ts`).
- `utils/`: Helper functions for dates, formatting, and RBAC evaluation.

---

## 🧠 State Management (Zustand)

Instead of complex Redux boilerplates, we use **Zustand** for global state. The primary global state is the User session, managed in `useAuthStore.ts`.

```typescript
// Example usage in a component
import { useAuthStore } from '../store/useAuthStore';

const Dashboard = () => {
  const { user, currentCenter } = useAuthStore();
  
  return <h1>Welcome, {user?.fullName} to {currentCenter?.name}</h1>;
}
```

---

## 🌐 API Integration (Services)

UI Components should **never** make direct `axios` calls. All API interactions must go through the `/src/services` layer.

### Why?
If the backend endpoint changes from `/api/students` to `/api/v2/students`, you only have to update `students.service.ts`, rather than hunting down 15 different components that hardcoded the URL.

```typescript
// Good - inside src/services/students.service.ts
export const getStudents = async () => {
  const response = await api.get('/students');
  return response.data;
};

// Inside your React Component
import { getStudents } from '../services/students.service';
// ... use getStudents() directly or via React Query
```

---

## 🎨 Styling & Tailwind CSS

The project uses Tailwind CSS for styling. We rely on utility classes rather than custom `.css` files.

- **Theme Consistency:** Stick to the predefined tailwind colors and spacing. Do not use arbitrary values (e.g., `w-[325px]`) unless absolutely necessary. Use Tailwind's grid and flexbox utilities.
- **Dynamic Classes:** Use the `clsx` and `tailwind-merge` libraries (often wrapped in a `cn()` utility) to cleanly join conditional CSS classes.

---

## 🔐 Frontend RBAC (Hiding UI Elements)

Just because the backend protects an endpoint doesn't mean the frontend should show the button to everyone. We use custom hooks to hide UI elements from users who shouldn't see them.

Use the `usePermission` hook to conditionally render UI:

```tsx
import { usePermission } from '../hooks/usePermission';

const StudentProfile = () => {
  const { hasRole } = usePermission();

  return (
    <div>
      <h1>Student Name</h1>
      {/* Only admins can see the Delete button */}
      {hasRole(['super_admin', 'center_admin']) && (
        <button className="bg-red-500">Delete Student</button>
      )}
    </div>
  );
}
```
