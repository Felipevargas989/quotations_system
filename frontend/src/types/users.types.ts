import { UserRole } from "../constants/permissions";
import { Company } from "./companies.types";

export type User = {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  password: string;
  created_at: string;
  updated_at: string;
  company_id: Company["id"];
};

export type CreateUser = Omit<
  User,
  "id" | "user_id" | "created_at" | "updated_at"
>;

export type UpdateUser = Omit<CreateUser, "password" | "email">;

export type UserWithCompany = User & {
  companies: Omit<Company, "created_at">;
};
