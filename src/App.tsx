import { Routes, Route, Navigate } from 'react-router-dom';
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
  return (
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
  );
}
