const requireLogin = (req, res, next) => {
    if (!req.session.user) {
        if (req.accepts('html') && !req.path.startsWith('/api')) {
            return res.redirect('/login');
        }
        return res.status(401).json({ error: 'Please login to continue' });
    }
    next();
};

const requireInstructor = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    if (req.session.user.role !== 'instructor') {
        return res.status(403).json({ error: 'Instructor access required' });
    }
    next();
};

module.exports = { requireLogin, requireInstructor };
