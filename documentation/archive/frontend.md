# 🖥️ SPARSHA OMS - Frontend Architecture

The frontend is a highly reactive, single-page application built on **React 19**, **Vite 8**, and styled with **Tailwind CSS V4**. It is engineered to dynamically morph its interface based on the permissions of the authenticated user.

## 🚀 Core Engine: TanStack React-Query
We completely avoid raw `useEffect` API fetching. Every external data request is routed through `@tanstack/react-query`.
-   **Why?** This provides automatic caching, background refetching, and drastically simplifies the "Loading / Error / Success" UI states. 
-   **Mutations**: Form submissions (Exams, Attendance, Dynamic Forms) utilize `useMutation`, which automatically invalidates the relevant cache queries to instantly update the UI without a page reload.

## 🎨 Design System & Tailwind V4
The application is designed to be a premium, modern dashboard—not a generic admin panel.
-   **Micro-interactions**: We heavily utilize Tailwind transition utilities (`transition-all duration-300 ease-out`) for hover states on tables, buttons, and cards.
-   **CSS Variables**: Tailwind V4 natively supports deep CSS variable integration, allowing us to easily swap between organizational themes or dark mode.

## 🛡️ Role-Adaptive Interface

The frontend acts as a dynamic mirror to the backend's strict RBAC (Role-Based Access Control) matrix.

### 1. Dynamic Routing & Sidebar
The Sidebar navigation component is fed a configuration array. If the user's decoded JWT role (e.g., `teacher`) does not intersect with a route's `viewRoles` array (e.g., `["super_admin", "center_admin"]`), that navigation link is entirely stripped from the DOM.

### 2. The `usePermission` Hook
We employ a custom `usePermission` hook down to the component level to hide or show specific interaction points.
```tsx
const { can } = usePermission();
// A teacher can view the equipment list, but only an admin sees the 'Order New' button.
{can('create', 'equipment') && <Button>Order New</Button>}
```

### 3. Center Switcher Mechanics
-   **Super Admins**: Have a global dropdown in the Navbar allowing them to pivot the entire application's data context between "All Centers" or a specific target.
-   **Standard Staff**: If a user is only assigned to a single center in the database, this dropdown vanishes, locking their interface to their localized environment natively.
