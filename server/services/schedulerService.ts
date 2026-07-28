import cron from "node-cron";
import { Post } from "../models/Post.js";
import { Account } from "../models/Account.js";
import zernio from "../config/Zernio.js";
import { ActivityLog } from "../models/ActivityLog.js";


export const initScheduler = ()=>{
    cron.schedule("* * * * * * ", async()=>{
        try {
            const now = new Date();
            const postsToPublish = await Post.find({status: "scheduled", scheduledFor: {$lte: now}});

            for (const post of postsToPublish) {
                try {
                    const accounts = await Account.find({
                        user:post.user,
                        platform: {$in: post.platforms},
                        status: "connected",
                        zernioAccountId: {$exists: true}
                    })

                    if(accounts.length === 0){
                        console.log(`No connected Zernio accounts found for post ${post._id}`);
                        continue;
                    }


                    const zernioPlatforms = accounts.map((acc)=>({
                        platform: acc.platform as any,
                        accountId: acc.zernioAccountId!
                    }))

                    const payload = {
                        content: post.content,
                        publishNow: true,
                        ...(post.mediaUrl ? {mediaItems: [{type: post.mediaType || "image", url:post.mediaUrl}]}: {}),
                        platforms:zernioPlatforms,
                    }

                    console.log(`Publish post ${post._id} to Zernio with media: ${post.mediaUrl || "none"}`)
                    console.log('Zernio payload:', JSON.stringify(payload));

                    const response = await zernio.posts.createPost({
                        body:payload
                    })



                    const publishedPost = (response.data as any)?.post || response.data;

                    if(!publishedPost){
                        throw new Error("Failed to get post object from Zernio response");
                    }

                    console.log(`Zernio post created: ${publishedPost._id || publishedPost.id}`);

                    post.status ="published";

                    await post.save();

                    await ActivityLog.create({

                        user: post.user,
                        actionType:"POST_PUBLISHED",
                        description: `Published post to ${accounts.map((a) =>a.platform).join(", ")}`,
                        relatedPost: post._id,

                    })

                } catch (error: any) {
                    const status = error?.response?.status;
                    const data = error?.response?.data;
                    console.error(`Failed to publish post ${post._id} : status=${status} message=${error?.message}`);
                    if (status) console.error('Zernio response status:', status);
                    if (data) console.error('Zernio response body:', JSON.stringify(data));
                    post.status = "failed";
                    await post.save();
                }
                
            }




            if(postsToPublish.length > 0){
                console.log(`Evaluated ${postsToPublish.length} posts at ${now.toISOString()}`);
            }
        } catch (error) {
            console.error("Error in schedule:", error);
        }
    })

    console.log("Scheduler service initialized")
}