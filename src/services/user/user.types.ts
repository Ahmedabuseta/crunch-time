export interface User {
  id: string
  name: string
  role: 'admin' | 'cashier'
  active: boolean
  createdAt: string
}

export interface CreateUserInput {
  name: string
  pin: string
  role?: 'admin' | 'cashier'
}

export interface UpdateUserInput {
  name?: string
  pin?: string
  role?: 'admin' | 'cashier'
}

export interface AuthenticatedUser {
  id: string
  name: string
  role: 'admin' | 'cashier'
}
