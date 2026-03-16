const prisma = require('../config/prisma');

const getNotifications = async (req, res, next) => {
    try {
        const notifications = await prisma.notification.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: 'desc' },
            include: {
                from: {
                    select: { id: true, username: true, displayName: true, avatarUrl: true }
                  },
                  tweet: {
                    select: { id: true, content: true }
                  }
            }
          });
      
          res.json({notifications});
        } catch (error) { 
          next(error); 
    }
};

const markAsRead = async (req, res, next) => {
    try{
        const notifications = await prisma.notification.updateMany({
            where: { userId: req.user.id, isRead: false},
            data: {isRead:true}
          });
          res.json({message: 'Уведомления прочитаны', notifications});
    }catch (error) {
        next(error);
    }
 };
module.exports = {getNotifications, markAsRead}