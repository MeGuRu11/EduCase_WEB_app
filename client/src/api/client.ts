// Axios instance + JWT interceptors. See PROJECT_DESIGN §7.1.
import axios from "axios";

const api = axios.create({ baseURL: "/api" });

// TODO: Add request interceptor (attach Bearer token)
// TODO: Add response interceptor (auto-refresh on 401)

export default api;
