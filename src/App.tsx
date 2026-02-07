import { Routes, Route, Navigate, useNavigate, useHref } from 'react-router-dom';
import { RouterProvider } from 'react-aria-components';
import { authService } from './services/authService';
import { LoaderProvider } from './contexts/LoaderContext';
import Login from './components/Login';
import MasterLayout from './layouts/MasterLayout';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!authService.isLoggedIn()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const navigate = useNavigate();

  return (
    <RouterProvider navigate={navigate} useHref={useHref}>
      <LoaderProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <MasterLayout />
              </ProtectedRoute>
            }
          />
        </Routes>
      </LoaderProvider>
    </RouterProvider>
  );
}
