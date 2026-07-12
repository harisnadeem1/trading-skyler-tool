import { api } from './api.js';

class AuthManager {
  constructor() {
    this.currentUser = null;
  }

  async checkAuth() {
    try {
      const result = await api.get('/auth/me');
      this.currentUser = result.user;
      return result.user;
    } catch (error) {
      this.currentUser = null;
      return null;
    }
  }

  async login(email, password) {
    const result = await api.post('/auth/login', { email, password });
    this.currentUser = result.user;
    return result.user;
  }

  async logout() {
    try {
      await api.post('/auth/logout', {});
    } catch (error) {
      console.warn('Logout failed:', error.message);
    }
    this.currentUser = null;
  }

  isAuthenticated() {
    return !!this.currentUser;
  }

  getUser() {
    return this.currentUser;
  }
}

export const authManager = new AuthManager();