
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { Provider } from "react-redux";
import store from "./store/store.ts";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import Home from "./pages/Home.tsx";
// import { ThemeProvider } from "./components/ThemeProvider.tsx";
import Dashboard from "./pages/Dashboard.tsx";

import ProtectedRoute from "./components/ProtectedRoute";
import PageNotFound from "./components/PageNotFound.tsx";
import EmailDisplay from "./pages/EmailDisplay.tsx";
import ContactUs from "./pages/ContactUs.tsx";
import AboutUs from "./pages/AboutUs.tsx";
const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      {
        path: "/",
        element: <Home />,
      },
      // {
      //   path: "/login",
      //   element: (
      //     <AuthLayout authentication={false}>
      //       <Login />
      //     </AuthLayout>
      //   ),
      // },
      // {
      //   path: "/signup",
      //   element: (
      //     <AuthLayout authentication={false}>
      //       <Signup />
      //     </AuthLayout>
      //   ),
      // },
      {
        path: "/chat-dashboard",
        element: (
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        ),
      },
      {
        path: "*",
        element: (
          // <AuthLayout authentication>
            <PageNotFound />
          //  </AuthLayout>
        ),
      },
      {
        path: "/test",
        element: (
          // <AuthLayout authentication>
            <EmailDisplay/>
          //  </AuthLayout>
        ),
      },
      {
        path: "/contact",
        element: (
          // <AuthLayout authentication>
            <ContactUs/>
          //  </AuthLayout>
        ),
      },
      {
        path: "/about",
        element: (
          // <AuthLayout authentication>
            <AboutUs/>
          //  </AuthLayout>
        ),
      },
      // {
      //   path: "/edit-post/:slug",
      //   element: (
      //     <AuthLayout authentication>
      //       {" "}
      //       <EditPost />
      //     </AuthLayout>
      //   ),
      // },
      // {
      //   path: "/post/:slug",
      //   element: <Post />,
      // },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <Provider store={store}>
    <RouterProvider router={router} />
  </Provider>
);




