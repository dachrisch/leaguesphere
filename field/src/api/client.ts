import axios, { type AxiosError, type AxiosResponse } from "axios";

export type ApiError = {
  status: number;
  message: string;
  body?: unknown;
};

const LOGIN_URL = "/login/?next=/field/";

axios.defaults.xsrfCookieName = "csrftoken";
axios.defaults.xsrfHeaderName = "X-CSRFToken";

const requestConfig = () => {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Token ${token}`;
  }
  return { headers };
};

const toApiError = (error: AxiosError): ApiError => {
  const status = error.response?.status ?? 0;
  const body = error.response?.data;
  let message = error.message;
  if (body && typeof body === "object" && "detail" in body) {
    message = String((body as { detail: unknown }).detail);
  }
  return { status, message, body };
};

const resolve = async <T>(pending: Promise<AxiosResponse<T>>): Promise<T> => {
  try {
    const response = await pending;
    return response.data;
  } catch (error) {
    const apiError = toApiError(error as AxiosError);
    if (apiError.status === 401) {
      window.location.assign(LOGIN_URL);
    }
    throw apiError;
  }
};

export const apiGet = <T>(url: string): Promise<T> =>
  resolve<T>(axios.get<T>(url, requestConfig()));

export const apiPut = <T>(url: string, body: unknown): Promise<T> =>
  resolve<T>(axios.put<T>(url, body, requestConfig()));
