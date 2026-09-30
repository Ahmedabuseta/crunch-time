export interface User {
  id: string
  name: string
  role: 'admin' | 'cashier'
  active: boolean
  createdAt: string
  hourlyRate?: number
  commissionRate?: number
}

export interface CreateUserInput {
  name: string
  pin: string
  role?: 'admin' | 'cashier'
  hourlyRate?: number
  commissionRate?: number
}

export interface UpdateUserInput {
  name?: string
  pin?: string
  role?: 'admin' | 'cashier'
  hourlyRate?: number
  commissionRate?: number
}

export interface AuthenticatedUser {
  id: string
  name: string
  role: 'admin' | 'cashier'
}
