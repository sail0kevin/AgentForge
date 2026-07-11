# -*- coding: utf-8 -*-
import os
target = 'src/components/workspace/workspace-app.tsx'
if os.path.exists(target):
    os.remove(target)
print('removed', target)