import { configureStore } from "@reduxjs/toolkit";
import { authSlice } from "./services";

const store = configureStore({
  reducer: {
    auth: authSlice,
  },
});

export default store;
