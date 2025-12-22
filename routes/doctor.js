/**
 * Doctor Routes
 * Handles doctor dashboard and operations
 */

import express from 'express';

const router = express.Router();

// ===========================================
// MIDDLEWARE - Check if user is doctor
// ===========================================

function requireDoctor(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'doctor') {
        return res.status(403).render('error', {
            title: 'Access Denied',
            message: 'You do not have permission to access this page',
            statusCode: 403
        });
    }
    next();
}

// Apply middleware to all doctor routes
router.use(requireDoctor);

// ===========================================
// DOCTOR DASHBOARD
// ===========================================

router.get('/dashboard', async (req, res) => {
    try {
        res.render('doctor/dashboard', {
            title: 'Doctor Dashboard',
            user: req.session.user
        });
    } catch (error) {
        console.error('Doctor dashboard error:', error);
        res.render('doctor/dashboard', {
            title: 'Doctor Dashboard',
            user: req.session.user
        });
    }
});

export default router;
