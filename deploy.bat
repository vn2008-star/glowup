@echo off
echo 🚀 Deploying GlowUp...
git add -A
git commit -m "Update %date% %time%"
git push origin main
echo ✅ Pushed! Vercel will auto-deploy in ~1 min.
echo 🌐 https://glowup-jade.vercel.app
pause
