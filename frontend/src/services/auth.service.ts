import { apiRequest } from "./api";

export const requestPasswordRecovery = async (email: string) => {
  return apiRequest("/auth/password/recovery", "POST", { email });
};

export const resetPasswordWithToken = async (
  accessToken: string,
  password: string,
) => {
  return apiRequest("/auth/password/reset", "POST", {
    accessToken,
    password,
  });
};
